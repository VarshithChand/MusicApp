import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../auth";
import { query } from "../db";
import { saveBuffer, usingR2 } from "../storage";
import { SONG_SELECT } from "./catalog";

/**
 * Discover: search a catalogue of freely licensed music (Jamendo, Creative Commons) and import tracks into
 * our own library. Only sources that explicitly allow streaming and downloading are used here — never
 * copyrighted catalogues.
 */
export const discoverRouter = Router();
discoverRouter.use(requireAuth);

const CLIENT_ID = process.env.JAMENDO_CLIENT_ID;
const API = "https://api.jamendo.com/v3.0/tracks/";

interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  album_name?: string;
  album_image?: string;
  image?: string;
  audio: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  license_ccurl?: string;
  musicinfo?: { tags?: { genres?: string[] } };
}

async function fetchTracks(params: Record<string, string>): Promise<JamendoTrack[]> {
  const url = new URL(API);
  url.search = new URLSearchParams({
    client_id: CLIENT_ID!,
    format: "json",
    audioformat: "mp32",
    imagesize: "300",
    include: "musicinfo+licenses",
    ...params,
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jamendo responded ${res.status}`);
  const data = (await res.json()) as { headers?: { status?: string; error_message?: string }; results?: JamendoTrack[] };
  if (data.headers?.status !== "success") throw new Error(data.headers?.error_message || "Jamendo request failed");
  return data.results ?? [];
}

const summary = (t: JamendoTrack) => ({
  externalId: t.id,
  title: t.name,
  artist: t.artist_name,
  album: t.album_name || null,
  cover: t.album_image || t.image || null,
  duration: t.duration,
  streamUrl: t.audio,
  licenseUrl: t.license_ccurl || null,
});

discoverRouter.get("/search", async (req, res) => {
  if (!CLIENT_ID) return res.json({ configured: false, results: [] });
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ configured: true, results: [] });
  try {
    const tracks = await fetchTracks({ search: q, limit: "15", order: "popularity_total" });
    res.json({ configured: true, results: tracks.map(summary) });
  } catch (err) {
    console.error("discover search failed:", err);
    res.status(502).json({ error: "The music catalogue is unavailable right now." });
  }
});

/** Finds a row by name or creates it. */
async function upsertByName(table: "artists" | "genres", value: string): Promise<number> {
  const [found] = await query(`SELECT id FROM ${table} WHERE lower(name) = lower($1) LIMIT 1`, [value]);
  if (found) return found.id;
  const [created] = await query(
    table === "artists" ? "INSERT INTO artists (name) VALUES ($1) RETURNING id" : "INSERT INTO genres (name) VALUES ($1) RETURNING id",
    [value],
  );
  return created.id;
}

/** After responding, copies the audio into our own storage so the song no longer depends on Jamendo. */
async function mirrorAudio(songId: number, track: JamendoTrack) {
  if (!usingR2 || !track.audiodownload_allowed || !track.audiodownload) return;
  try {
    const res = await fetch(track.audiodownload, { redirect: "follow" });
    if (!res.ok) return;
    const body = Buffer.from(await res.arrayBuffer());
    const url = await saveBuffer(body, ".mp3", "audio/mpeg");
    await query("UPDATE songs SET audio_url = $1 WHERE id = $2", [url, songId]);
  } catch (err) {
    console.error(`mirroring song ${songId} failed (it keeps streaming from the catalogue):`, err);
  }
}

const importSchema = z.object({ externalId: z.string().regex(/^\d+$/) });

discoverRouter.post("/import", async (req, res) => {
  if (!CLIENT_ID) return res.status(503).json({ error: "Music discovery isn't set up yet." });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "externalId required" });
  const { externalId } = parsed.data;

  const existing = await query(`${SONG_SELECT} WHERE s.source = 'jamendo' AND s.external_id = $1`, [externalId]);
  if (existing.length) return res.json(existing[0]);

  let track: JamendoTrack | undefined;
  try {
    [track] = await fetchTracks({ id: externalId, limit: "1" });
  } catch (err) {
    console.error("discover import failed:", err);
    return res.status(502).json({ error: "The music catalogue is unavailable right now." });
  }
  if (!track) return res.status(404).json({ error: "Song not found" });

  const artistId = await upsertByName("artists", track.artist_name);

  let albumId: number | null = null;
  if (track.album_name) {
    const [album] = await query("SELECT id FROM albums WHERE lower(title) = lower($1) AND artist_id = $2 LIMIT 1", [track.album_name, artistId]);
    albumId =
      album?.id ??
      (await query("INSERT INTO albums (title, artist_id, cover_url) VALUES ($1, $2, $3) RETURNING id", [track.album_name, artistId, track.album_image || null]))[0].id;
  }

  const genre = track.musicinfo?.tags?.genres?.[0];
  const genreId = genre ? await upsertByName("genres", genre.charAt(0).toUpperCase() + genre.slice(1)) : null;

  const inserted = await query(
    `INSERT INTO songs (title, artist_id, album_id, genre_id, audio_url, cover_url, duration, source, external_id, license_url, downloadable)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'jamendo', $8, $9, $10)
     ON CONFLICT (source, external_id) WHERE source IS NOT NULL DO NOTHING
     RETURNING id`,
    [track.name, artistId, albumId, genreId, track.audio, track.album_image || track.image || null, track.duration, externalId, track.license_ccurl || null, !!track.audiodownload_allowed],
  );

  const [song] = await query(`${SONG_SELECT} WHERE s.source = 'jamendo' AND s.external_id = $1`, [externalId]);
  res.status(inserted.length ? 201 : 200).json(song);

  // Don't make the listener wait: they stream from the catalogue immediately while we copy the file.
  if (inserted.length) void mirrorAudio(inserted[0].id, track);
});

// --- YouTube (official embedded player only: we search, the app plays the video in YouTube's own player) ---

const YT_KEY = process.env.YOUTUBE_API_KEY;

/** Language names appended to a search so results actually come back in that language. */
const SEARCH_LANGUAGES: Record<string, string> = {
  te: "Telugu",
  hi: "Hindi",
  ta: "Tamil",
  kn: "Kannada",
  ml: "Malayalam",
  en: "English",
};

// A search costs 100 of the 10,000 free daily quota units, so results are reused for 6 hours.
const SEARCH_TTL_MS = 24 * 60 * 60_000;
const ytCache = new Map<string, { at: number; results: unknown[] }>();

// Results are also kept in the database, so a restart or deploy doesn't force new searches,
// and when YouTube fails (usually the daily quota) the last good list is served instead of an error.
async function loadSaved(key: string): Promise<{ at: number; results: unknown[] } | null> {
  try {
    const [row] = await query<{ results: unknown[]; at: Date }>("SELECT results, at FROM youtube_cache WHERE key = $1", [key]);
    return row ? { at: new Date(row.at).getTime(), results: row.results } : null;
  } catch {
    return null;
  }
}
function saveResults(key: string, results: unknown[]) {
  query(
    "INSERT INTO youtube_cache (key, results, at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET results = EXCLUDED.results, at = now()",
    [key, JSON.stringify(results)],
  ).catch(() => {});
}

// --- Why YouTube last refused us ---------------------------------------------
// Without this, every failure looked the same from outside ("unavailable"), and the only
// way to tell a spent quota from a bad key was to read the server log.

type YtError = { message?: string; errors?: { reason?: string }[] };
/** Reasons that always mean the day's 10,000 units are gone; they only clear at the daily reset. */
const DAILY_LIMIT_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded"]);

/**
 * Has the daily allowance run out? Searches are the expensive part of the quota, and when they
 * run out YouTube says so in two different ways: 403 "quotaExceeded", or 429 "rateLimitExceeded"
 * whose message names a per-day limit. The second looks like ordinary short-term throttling,
 * so the message is what tells them apart — only the daily kind is worth waiting out.
 */
function isDailyLimit(reason: string | null, message: string | null): boolean {
  if (reason && DAILY_LIMIT_REASONS.has(reason)) return true;
  return !!message && /per day/i.test(message);
}
const QUOTA_MESSAGE = "This app has used up its daily YouTube allowance. Videos come back after the limit resets (midnight Pacific time).";

let lastFailure: { at: string; scope: string; status: number; reason: string | null; message: string | null } | null = null;
let quotaSpentUntil = 0;

/** The quota resets at midnight Pacific, so work out when that next happens from the Pacific wall clock (DST and all). */
function nextQuotaReset(now: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(now));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const intoDayMs = ((part("hour") % 24) * 3600 + part("minute") * 60 + part("second")) * 1000;
  return now - intoDayMs + 24 * 60 * 60_000;
}

/** Records a failed YouTube call, starts waiting out a spent daily allowance, and reports what happened. */
function noteFailure(scope: string, status: number, error: YtError | undefined): { reason: string | null; daily: boolean } {
  const reason = error?.errors?.find((e) => e.reason)?.reason ?? null;
  const message = error?.message ?? null;
  lastFailure = { at: new Date().toISOString(), scope, status, reason, message };
  console.error(`youtube ${scope} failed:`, status, reason ?? "(no reason)", message ?? "");
  const daily = isDailyLimit(reason, message);
  if (daily) quotaSpentUntil = nextQuotaReset(Date.now());
  return { reason, daily };
}

const quotaSpent = () => Date.now() < quotaSpentUntil;
const failureMessage = (daily: boolean, fallback: string) => (daily ? QUOTA_MESSAGE : fallback);

/** For /health: the last YouTube refusal and whether we're waiting out the quota. Never includes the key. */
export function youtubeStatus() {
  return {
    lastError: lastFailure,
    quotaSpentUntil: quotaSpent() ? new Date(quotaSpentUntil).toISOString() : null,
  };
}

/**
 * The most popular music videos in a region, taken from videos.list. That costs one quota unit and,
 * unlike search, is not capped by the separate daily limit on search queries -- so it still answers
 * once searching for the day has run out. It cannot be narrowed to a language, so it stands in for
 * the usual rows rather than replacing them, and the app says so.
 */
const CHART_TTL_MS = 60 * 60_000;
const CHART_REGION = "IN";
/** Pages of the chart to walk; each is one quota unit and 50 more videos to pick a language from. */
const CHART_PAGES = 4;
const CHART_NOTE = "Showing popular music videos instead: searching by language has reached its daily limit and comes back after midnight Pacific time.";
type ChartItem = { language: string | null; publishedAt: string; video: unknown };
const chartCache = new Map<string, { at: number; items: ChartItem[] }>();

/** Keeps only what the listener asked to hear. A video that never says its language is left out, because
 * a chart for the whole region is mostly other languages and guessing would put them back on the page. */
function inLanguage(items: ChartItem[], lang: string | null, newestFirst: boolean): unknown[] {
  const kept = lang ? items.filter((i) => i.language?.toLowerCase().split("-")[0] === lang) : items;
  // The chart arrives in popularity order, so only the newest row needs resorting.
  const ordered = newestFirst ? [...kept].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)) : kept;
  return ordered.map((i) => i.video);
}

async function fetchPopularChart(key: string, lang: string | null, newestFirst = false): Promise<unknown[] | null> {
  const fresh = chartCache.get(CHART_REGION);
  if (fresh && Date.now() - fresh.at < CHART_TTL_MS) return inLanguage(fresh.items, lang, newestFirst);

  // Only a fraction of a region-wide chart is in any one language, so walk several pages. Each page
  // costs a single quota unit, against a hundred for one search, so this stays cheap enough to be free.
  const pages: ChartPage["items"] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < CHART_PAGES; page++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({
      part: "snippet,contentDetails",
      chart: "mostPopular",
      videoCategoryId: "10", // Music
      regionCode: CHART_REGION,
      maxResults: "50", // the most a single page allows
      key,
      ...(pageToken ? { pageToken } : {}),
    }).toString();

    const response = await fetch(url);
    const body = (await response.json().catch(() => null)) as ChartPage | null;
    if (!response.ok || !body?.items) {
      // Keep whatever earlier pages gave us; only complain when there is nothing at all.
      if (!pages.length) {
        noteFailure("popular chart", response.status, body?.error);
        return null;
      }
      break;
    }
    pages.push(...body.items);
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  const items: ChartItem[] = pages.map((i) => ({
    language: i.snippet.defaultAudioLanguage ?? i.snippet.defaultLanguage ?? null,
    publishedAt: i.snippet.publishedAt ?? "",
    video: {
      videoId: i.id,
      title: decode(i.snippet.title),
      channel: decode(i.snippet.channelTitle),
      thumbnail: i.snippet.thumbnails?.medium?.url ?? null,
      durationSeconds: isoDurationToSeconds(i.contentDetails.duration),
    },
  }));
  chartCache.set(CHART_REGION, { at: Date.now(), items });
  return inLanguage(items, lang, newestFirst);
}

interface ChartPage {
  nextPageToken?: string;
  items?: {
    id: string;
    snippet: {
      title: string;
      channelTitle: string;
      publishedAt?: string;
      thumbnails?: { medium?: { url: string } };
      defaultAudioLanguage?: string;
      defaultLanguage?: string;
    };
    contentDetails: { duration: string };
  }[];
  error?: YtError;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// Looks up video lengths for a batch of IDs (one quota unit per call, however many IDs).
async function fetchDurations(ids: string[], key: string) {
  const durations = new Map<string, number | null>();
  if (!ids.length) return durations;
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.search = new URLSearchParams({ part: "contentDetails", id: ids.join(","), key }).toString();
  const body = (await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as
    | { items?: { id: string; contentDetails: { duration: string } }[] }
    | null;
  for (const d of body?.items ?? []) durations.set(d.id, isoDurationToSeconds(d.contentDetails.duration));
  return durations;
}

discoverRouter.get("/youtube", async (req, res) => {
  if (!YT_KEY) return res.json({ configured: false, results: [] });
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ configured: true, results: [] });

  const order = ["relevance", "viewCount", "date"].includes(String(req.query.order)) ? String(req.query.order) : "relevance";
  // A listener who picked languages gets results in one of them; the name is appended because
  // relevanceLanguage alone only nudges the ranking, it does not keep other languages out.
  const lang = SEARCH_LANGUAGES[String(req.query.lang ?? "").toLowerCase()] ? String(req.query.lang).toLowerCase() : null;
  const cacheKey = `${order}:${lang ?? "any"}:${q.toLowerCase()}`;
  const hit = ytCache.get(cacheKey) ?? (await loadSaved(`search:${cacheKey}`));
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return res.json({ configured: true, results: hit.results });

  // The day's searching is gone: serve what was saved, else the chart, rather than a call that will be refused.
  if (quotaSpent()) {
    if (hit) return res.json({ configured: true, results: hit.results, stale: true });
    const chart = await fetchPopularChart(YT_KEY, lang, order === "date");
    if (chart?.length) return res.json({ configured: true, results: chart, note: CHART_NOTE });
    return res.status(502).json({ error: QUOTA_MESSAGE, reason: "quotaExceeded" });
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10", // Music
    videoEmbeddable: "true",
    videoSyndicated: "true", // plays outside youtube.com
    maxResults: "25", // enough for the app to show both the most watched and the newest from one search
    order,
    q: lang ? `${q} ${SEARCH_LANGUAGES[lang]} song` : q,
    key: YT_KEY,
    ...(lang ? { relevanceLanguage: lang, regionCode: "IN" } : {}),
  }).toString();
  if (order === "date") url.searchParams.set("publishedAfter", new Date(Date.now() - 30 * 86400_000).toISOString());

  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as
    | {
        items?: {
          id: { videoId: string };
          snippet: { title: string; channelTitle: string; publishedAt?: string; thumbnails?: { medium?: { url: string } } };
        }[];
        error?: YtError;
      }
    | null;
  if (!response.ok || !body?.items) {
    const { reason, daily } = noteFailure("search", response.status, body?.error);
    if (hit) return res.json({ configured: true, results: hit.results, stale: true });
    if (daily) {
      const chart = await fetchPopularChart(YT_KEY, lang, order === "date");
      if (chart?.length) return res.json({ configured: true, results: chart, note: CHART_NOTE });
    }
    return res.status(502).json({ error: failureMessage(daily, "YouTube search is unavailable right now."), reason });
  }

  const durations = await fetchDurations(body.items.map((i) => i.id.videoId), YT_KEY);
  const results = body.items.map((i) => ({
    videoId: i.id.videoId,
    title: decode(i.snippet.title),
    channel: decode(i.snippet.channelTitle),
    thumbnail: i.snippet.thumbnails?.medium?.url ?? null,
    durationSeconds: durations.get(i.id.videoId) ?? null,
    publishedAt: i.snippet.publishedAt ?? null,
  }));
  if (ytCache.size > 200) ytCache.clear();
  ytCache.set(cacheKey, { at: Date.now(), results });
  saveResults(`search:${cacheKey}`, results);
  res.json({ configured: true, results });
});

// --- One video by ID, for the Video page (paste a URL, look it up) -----------

const VIDEO_ID = /^[\w-]{11}$/;
const ytVideoCache = new Map<string, { at: number; video: unknown }>();

// ISO-8601 duration like "PT4M13S" -> seconds. Returns null if it can't be parsed.
function isoDurationToSeconds(iso: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return null;
  const [, h, min, s] = m;
  return (Number(h ?? 0) * 3600) + (Number(min ?? 0) * 60) + Number(s ?? 0);
}

discoverRouter.get("/youtube-video", async (req, res) => {
  if (!YT_KEY) return res.json({ configured: false, video: null });
  const id = String(req.query.id ?? "").trim();
  if (!VIDEO_ID.test(id)) return res.status(400).json({ error: "That doesn't look like a YouTube video ID." });

  const hit = ytVideoCache.get(id);
  if (hit && Date.now() - hit.at < 60 * 60_000) return res.json({ configured: true, video: hit.video });

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.search = new URLSearchParams({ part: "snippet,contentDetails,status", id, key: YT_KEY }).toString();
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as
    | {
        items?: {
          id: string;
          snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } };
          contentDetails: { duration: string };
          status: { embeddable: boolean; privacyStatus: string };
        }[];
        error?: YtError;
      }
    | null;
  if (!response.ok) {
    const { reason, daily } = noteFailure("video lookup", response.status, body?.error);
    return res.status(502).json({ error: failureMessage(daily, "YouTube lookup is unavailable right now."), reason });
  }
  const item = body?.items?.[0];
  if (!item) return res.status(404).json({ error: "That video wasn't found. It may have been removed." });
  if (!item.status.embeddable) return res.status(409).json({ error: "This video's owner has disabled playing it outside YouTube." });
  if (item.status.privacyStatus !== "public" && item.status.privacyStatus !== "unlisted") {
    return res.status(409).json({ error: "This video is private and can't be played here." });
  }

  const video = {
    videoId: item.id,
    title: decode(item.snippet.title),
    channel: decode(item.snippet.channelTitle),
    thumbnail: item.snippet.thumbnails?.medium?.url ?? null,
    durationSeconds: isoDurationToSeconds(item.contentDetails.duration),
  };
  if (ytVideoCache.size > 500) ytVideoCache.clear();
  ytVideoCache.set(id, { at: Date.now(), video });
  res.json({ configured: true, video });
});

// --- Favorite YouTube videos (synced to the account; a video ID means the same thing on any device) ---------

discoverRouter.get("/youtube-video/favorites", async (req: AuthedRequest, res) => {
  const rows = await query(
    "SELECT external_id AS \"videoId\", title, channel, thumbnail FROM media_favorites WHERE user_id = $1 AND kind = 'youtube' ORDER BY created_at DESC",
    [req.userId],
  );
  res.json(rows);
});

const favoriteSchema = z.object({
  title: z.string().min(1).max(300),
  channel: z.string().max(300).nullable().optional(),
  thumbnail: z.string().url().nullable().optional(),
});

discoverRouter.post("/youtube-video/:id/favorite", async (req: AuthedRequest, res) => {
  const id = req.params.id;
  if (!VIDEO_ID.test(id)) return res.status(400).json({ error: "That doesn't look like a YouTube video ID." });
  const parsed = favoriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A title is required to save a favorite." });
  await query(
    `INSERT INTO media_favorites (user_id, kind, external_id, title, channel, thumbnail) VALUES ($1, 'youtube', $2, $3, $4, $5)
     ON CONFLICT (user_id, kind, external_id) DO UPDATE SET title = excluded.title, channel = excluded.channel, thumbnail = excluded.thumbnail`,
    [req.userId, id, parsed.data.title, parsed.data.channel ?? null, parsed.data.thumbnail ?? null],
  );
  res.status(204).end();
});

discoverRouter.delete("/youtube-video/:id/favorite", async (req: AuthedRequest, res) => {
  await query("DELETE FROM media_favorites WHERE user_id = $1 AND kind = 'youtube' AND external_id = $2", [req.userId, req.params.id]);
  res.status(204).end();
});

// --- Trending / popular in a language (official YouTube player only) ----------

const TRENDING_LANGUAGES: Record<string, { query: string; trending: string; popular: string }> = {
  te: { query: "Telugu", trending: "new Telugu songs", popular: "Telugu hit songs" },
  hi: { query: "Hindi", trending: "new Hindi songs", popular: "Hindi hit songs" },
  ta: { query: "Tamil", trending: "new Tamil songs", popular: "Tamil hit songs" },
  kn: { query: "Kannada", trending: "new Kannada songs", popular: "Kannada hit songs" },
  ml: { query: "Malayalam", trending: "new Malayalam songs", popular: "Malayalam hit songs" },
  en: { query: "English", trending: "new English songs", popular: "English hit songs" },
};

// Each search costs 100 of the free 10,000 daily units, so these cache times keep the Home rows fresh without running out.
const TREND_TTL = { trending: 12 * 60 * 60_000, popular: 24 * 60 * 60_000 } as const;
const TREND_WINDOW_DAYS = { trending: 30, popular: 30 } as const;
const MIN_FRESH_MS = 10 * 60_000;
const trendCache = new Map<string, { at: number; results: unknown[] }>();

/**
 * GET /discover/trending?lang=te&kind=trending|popular
 *  trending = Telugu music videos from the last 30 days, most viewed first
 *  popular  = most viewed Telugu music videos from the last year
 */
discoverRouter.get("/trending", async (req, res) => {
  if (!YT_KEY) return res.json({ configured: false, results: [] });
  const lang = String(req.query.lang ?? "te").toLowerCase();
  const kind = req.query.kind === "popular" ? "popular" : "trending";
  const cfg = TRENDING_LANGUAGES[lang];
  if (!cfg) return res.status(400).json({ error: "Unsupported language" });

  const key = `${lang}:${kind}`;
  const hit = trendCache.get(key) ?? (await loadSaved(`trend:${key}`));
  const age = hit ? Date.now() - hit.at : Infinity;
  // A pull-to-refresh skips the cache, but not if it was refreshed in the last few minutes (protects the daily quota).
  const wantFresh = req.query.fresh === "1" && age >= MIN_FRESH_MS;
  if (hit && age < TREND_TTL[kind] && !wantFresh) return res.json({ configured: true, results: hit.results });

  // Searching for the day is spent: serve what was saved, else the chart, rather than a call that will be refused.
  if (quotaSpent()) {
    if (hit) return res.json({ configured: true, results: hit.results, stale: true });
    const chart = await fetchPopularChart(YT_KEY, lang, kind === "trending");
    if (chart?.length) return res.json({ configured: true, results: chart, note: CHART_NOTE });
    return res.status(502).json({ error: QUOTA_MESSAGE, reason: "quotaExceeded" });
  }

  const params: Record<string, string> = {
    part: "snippet",
    type: "video",
    videoCategoryId: "10", // Music
    videoEmbeddable: "true",
    videoSyndicated: "true",
    regionCode: "IN",
    relevanceLanguage: lang,
    order: "viewCount",
    maxResults: "25",
    q: cfg[kind],
    key: YT_KEY,
  };
  params.publishedAfter = new Date(Date.now() - TREND_WINDOW_DAYS[kind] * 24 * 60 * 60_000).toISOString();

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as
    | { items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }[]; error?: YtError }
    | null;
  if (!response.ok || !body?.items) {
    const { reason, daily } = noteFailure("trending", response.status, body?.error);
    // Serve an older cached list rather than an error when YouTube (or the daily quota) is unavailable.
    if (hit) return res.json({ configured: true, results: hit.results, stale: true });
    // Searching is capped separately from the rest of the quota, so the chart often still answers.
    if (daily) {
      const chart = await fetchPopularChart(YT_KEY, lang, kind === "trending");
      if (chart?.length) return res.json({ configured: true, results: chart, note: CHART_NOTE });
    }
    return res.status(502).json({ error: failureMessage(daily, "YouTube is unavailable right now."), reason });
  }

  const durations = await fetchDurations(body.items.map((i) => i.id.videoId), YT_KEY);
  const results = body.items.map((i) => ({
    videoId: i.id.videoId,
    title: decode(i.snippet.title),
    channel: decode(i.snippet.channelTitle),
    thumbnail: i.snippet.thumbnails?.medium?.url ?? null,
    durationSeconds: durations.get(i.id.videoId) ?? null,
  }));
  trendCache.set(key, { at: Date.now(), results });
  saveResults(`trend:${key}`, results);
  res.json({ configured: true, results });
});
