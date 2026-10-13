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
// A search costs 100 of the 10,000 free daily quota units, so repeat searches are served from memory for 10 minutes.
const ytCache = new Map<string, { at: number; results: unknown[] }>();

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

discoverRouter.get("/youtube", async (req, res) => {
  if (!YT_KEY) return res.json({ configured: false, results: [] });
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json({ configured: true, results: [] });

  const cacheKey = q.toLowerCase();
  const hit = ytCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60_000) return res.json({ configured: true, results: hit.results });

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10", // Music
    videoEmbeddable: "true",
    videoSyndicated: "true", // plays outside youtube.com
    maxResults: "8",
    q,
    key: YT_KEY,
  }).toString();

  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as
    | { items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }[]; error?: { message?: string } }
    | null;
  if (!response.ok || !body?.items) {
    console.error("youtube search failed:", response.status, body?.error?.message);
    return res.status(502).json({ error: "YouTube search is unavailable right now." });
  }

  const results = body.items.map((i) => ({
    videoId: i.id.videoId,
    title: decode(i.snippet.title),
    channel: decode(i.snippet.channelTitle),
    thumbnail: i.snippet.thumbnails?.medium?.url ?? null,
  }));
  if (ytCache.size > 200) ytCache.clear();
  ytCache.set(cacheKey, { at: Date.now(), results });
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
        error?: { message?: string };
      }
    | null;
  if (!response.ok) {
    console.error("youtube video lookup failed:", response.status, body?.error?.message);
    return res.status(502).json({ error: "YouTube lookup is unavailable right now." });
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
};

// Trending changes through the day; "popular" barely changes. Long cache times keep us far below the free daily quota
// (each search costs 100 of 10,000 units).
const TREND_TTL = { trending: 6 * 60 * 60_000, popular: 24 * 60 * 60_000 } as const;
const trendCache = new Map<string, { at: number; results: unknown[] }>();

/**
 * GET /discover/trending?lang=te&kind=trending|popular
 *  trending = Telugu music videos from the last 30 days, most viewed first
 *  popular  = most viewed Telugu music videos of all time
 */
discoverRouter.get("/trending", async (req, res) => {
  if (!YT_KEY) return res.json({ configured: false, results: [] });
  const lang = String(req.query.lang ?? "te").toLowerCase();
  const kind = req.query.kind === "popular" ? "popular" : "trending";
  const cfg = TRENDING_LANGUAGES[lang];
  if (!cfg) return res.status(400).json({ error: "Unsupported language" });

  const key = `${lang}:${kind}`;
  const hit = trendCache.get(key);
  if (hit && Date.now() - hit.at < TREND_TTL[kind]) return res.json({ configured: true, results: hit.results });

  const params: Record<string, string> = {
    part: "snippet",
    type: "video",
    videoCategoryId: "10", // Music
    videoEmbeddable: "true",
    videoSyndicated: "true",
    regionCode: "IN",
    relevanceLanguage: lang,
    order: "viewCount",
    maxResults: "15",
    q: cfg[kind],
    key: YT_KEY,
  };
  if (kind === "trending") params.publishedAfter = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as
    | { items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: { medium?: { url: string } } } }[]; error?: { message?: string } }
    | null;
  if (!response.ok || !body?.items) {
    console.error("youtube trending failed:", response.status, body?.error?.message);
    // Serve an older cached list rather than an error when YouTube (or the daily quota) is unavailable.
    if (hit) return res.json({ configured: true, results: hit.results, stale: true });
    return res.status(502).json({ error: "YouTube is unavailable right now." });
  }

  const results = body.items.map((i) => ({
    videoId: i.id.videoId,
    title: decode(i.snippet.title),
    channel: decode(i.snippet.channelTitle),
    thumbnail: i.snippet.thumbnails?.medium?.url ?? null,
  }));
  trendCache.set(key, { at: Date.now(), results });
  res.json({ configured: true, results });
});
