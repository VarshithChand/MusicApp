import { Router } from "express";
import jwt from "jsonwebtoken";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { query } from "../db";
import { AuthedRequest, requireAuth } from "../auth";

export const songsRouter = Router();
export const artistsRouter = Router();
export const albumsRouter = Router();
export const genresRouter = Router();
export const moviesRouter = Router();
export const moodsRouter = Router();

const SONG_SELECT = `
  SELECT s.id, s.title, s.audio_url, s.cover_url, s.duration, s.play_count,
         s.artist_id, ar.name AS artist_name,
         s.album_id, al.title AS album_title,
         s.genre_id, g.name AS genre_name, s.license_url, s.source, s.downloadable,
         s.singers, s.music_director, s.language, s.description, s.description_source, s.track_number,
         (SELECT COALESCE(json_agg(m.slug ORDER BY sm.is_primary DESC, m.slug), '[]'::json)
            FROM song_moods sm JOIN moods m ON m.id = sm.mood_id WHERE sm.song_id = s.id) AS moods
  FROM songs s
  JOIN artists ar ON ar.id = s.artist_id
  LEFT JOIN albums al ON al.id = s.album_id
  LEFT JOIN genres g ON g.id = s.genre_id`;

/** Only finished work is public: the song and its movie must both be published. */
const PUBLISHED = "s.status = 'published' AND (al.id IS NULL OR al.status = 'published')";

function pageParams(req: { query: any }) {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  return { limit, offset };
}

/** "%text%" for ILIKE, with the wildcard characters in the text itself escaped. */
const likePattern = (text: string) => `%${text.replace(/[%_\\]/g, "\\$&")}%`;

// --- songs ---------------------------------------------------------------

songsRouter.get("/", async (req, res) => {
  const { limit, offset } = pageParams(req);
  const sort = req.query.sort === "popular" ? "s.play_count DESC, s.id DESC" : "s.created_at DESC, s.id DESC";

  // Optional filters: ?mood=sad&language=Telugu&q=text
  const where = [PUBLISHED];
  const params: unknown[] = [];

  const mood = String(req.query.mood ?? "").trim().toLowerCase();
  if (mood) {
    params.push(mood);
    where.push(
      `EXISTS (SELECT 1 FROM song_moods sm JOIN moods m ON m.id = sm.mood_id WHERE sm.song_id = s.id AND m.slug = $${params.length})`,
    );
  }
  const language = String(req.query.language ?? "").trim();
  if (language) {
    params.push(language);
    where.push(`lower(COALESCE(s.language, al.language, '')) = lower($${params.length})`);
  }
  const text = String(req.query.q ?? "").trim();
  if (text) {
    params.push(likePattern(text));
    const n = params.length;
    where.push(`(s.title ILIKE $${n} OR s.singers ILIKE $${n} OR ar.name ILIKE $${n} OR al.title ILIKE $${n})`);
  }

  params.push(limit, offset);
  res.json(
    await query(
      `${SONG_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${sort} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
  );
});

// Must be registered before "/:id".
songsRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ songs: [], artists: [], albums: [], genres: [] });
  const like = likePattern(q);

  const [songs, artists, albums, genres] = await Promise.all([
    query(
      `${SONG_SELECT}
       WHERE ${PUBLISHED}
         AND (s.title ILIKE $1 OR ar.name ILIKE $1 OR al.title ILIKE $1 OR g.name ILIKE $1
              OR s.singers ILIKE $1 OR s.music_director ILIKE $1 OR s.language ILIKE $1
              OR EXISTS (SELECT 1 FROM song_moods sm JOIN moods m ON m.id = sm.mood_id WHERE sm.song_id = s.id AND m.name ILIKE $1))
       ORDER BY s.play_count DESC LIMIT 30`,
      [like],
    ),
    query("SELECT id, name, image_url FROM artists WHERE name ILIKE $1 ORDER BY name LIMIT 20", [like]),
    query(
      `SELECT al.id, al.title, COALESCE(al.poster_url, al.cover_url) AS cover_url, al.artist_id, ar.name AS artist_name
       FROM albums al JOIN artists ar ON ar.id = al.artist_id
       WHERE al.status = 'published' AND (al.title ILIKE $1 OR al.music_director ILIKE $1)
       ORDER BY al.title LIMIT 20`,
      [like],
    ),
    query("SELECT id, name FROM genres WHERE name ILIKE $1 ORDER BY name LIMIT 20", [like]),
  ]);
  res.json({ songs, artists, albums, genres });
});

songsRouter.get("/:id", async (req, res) => {
  const [song] = await query(`${SONG_SELECT} WHERE s.id = $1 AND ${PUBLISHED}`, [req.params.id]);
  if (!song) return res.status(404).json({ error: "Song not found" });
  res.json(song);
});

/** Short-lived link a browser or app can open to download a song (no auth header needed on that request). */
songsRouter.post("/:id/download-link", requireAuth, async (req: AuthedRequest, res) => {
  const [song] = await query("SELECT id, downloadable FROM songs WHERE id = $1 AND status = 'published'", [req.params.id]);
  if (!song) return res.status(404).json({ error: "Song not found" });
  if (!song.downloadable) return res.status(403).json({ error: "This song isn't available for download." });
  const token = jwt.sign({ typ: "dl", sid: song.id, sub: req.userId }, process.env.JWT_SECRET!, { expiresIn: "2m" });
  const base = `${req.protocol}://${req.get("host")}`;
  res.json({ url: `${base}/songs/${song.id}/download?t=${token}` });
});

songsRouter.get("/:id/download", async (req, res) => {
  try {
    const decoded = jwt.verify(String(req.query.t ?? ""), process.env.JWT_SECRET!) as { typ?: string; sid?: number };
    if (decoded.typ !== "dl" || String(decoded.sid) !== req.params.id) throw new Error("wrong token");
  } catch {
    return res.status(401).json({ error: "This download link has expired. Please try again." });
  }

  const [song] = await query(
    "SELECT s.title, s.audio_url, s.downloadable, ar.name AS artist FROM songs s JOIN artists ar ON ar.id = s.artist_id WHERE s.id = $1 AND s.status = 'published'",
    [req.params.id],
  );
  if (!song) return res.status(404).json({ error: "Song not found" });
  if (!song.downloadable) return res.status(403).json({ error: "This song isn't available for download." });

  const filename = `${song.artist} - ${song.title}.mp3`.replace(/[^\w .,'()&-]/g, "_");
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  if (song.audio_url.startsWith("/media/")) {
    return res.sendFile(path.join(__dirname, "..", "..", "uploads", path.basename(song.audio_url)));
  }
  const upstream = await fetch(song.audio_url, { redirect: "follow" });
  if (!upstream.ok || !upstream.body) return res.status(502).json({ error: "The file isn't available right now." });
  const length = upstream.headers.get("content-length");
  if (length) res.setHeader("Content-Length", length);
  try {
    await pipeline(Readable.fromWeb(upstream.body as any), res);
  } catch {
    res.destroy();
  }
});

songsRouter.post("/:id/played", requireAuth, async (req: AuthedRequest, res) => {
  const songId = Number(req.params.id);
  const found = await query("UPDATE songs SET play_count = play_count + 1 WHERE id = $1 RETURNING id", [songId]);
  if (!found.length) return res.status(404).json({ error: "Song not found" });
  await query(
    `INSERT INTO recently_played (user_id, song_id) VALUES ($1, $2)
     ON CONFLICT (user_id, song_id) DO UPDATE SET played_at = now()`,
    [req.userId, songId],
  );
  res.status(204).end();
});

songsRouter.post("/:id/like", requireAuth, async (req: AuthedRequest, res) => {
  const found = await query("SELECT id FROM songs WHERE id = $1", [req.params.id]);
  if (!found.length) return res.status(404).json({ error: "Song not found" });
  await query("INSERT INTO likes (user_id, song_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.userId, req.params.id]);
  res.status(204).end();
});

songsRouter.delete("/:id/like", requireAuth, async (req: AuthedRequest, res) => {
  await query("DELETE FROM likes WHERE user_id = $1 AND song_id = $2", [req.userId, req.params.id]);
  res.status(204).end();
});

// --- artists -------------------------------------------------------------

artistsRouter.get("/", async (req, res) => {
  const { limit, offset } = pageParams(req);
  res.json(await query("SELECT id, name, image_url FROM artists ORDER BY name LIMIT $1 OFFSET $2", [limit, offset]));
});

artistsRouter.get("/:id", async (req, res) => {
  const [artist] = await query("SELECT id, name, image_url FROM artists WHERE id = $1", [req.params.id]);
  if (!artist) return res.status(404).json({ error: "Artist not found" });
  res.json(artist);
});

artistsRouter.get("/:id/songs", async (req, res) => {
  res.json(
    await query(`${SONG_SELECT} WHERE s.artist_id = $1 AND ${PUBLISHED} ORDER BY s.play_count DESC, s.id`, [req.params.id]),
  );
});

// --- albums --------------------------------------------------------------

albumsRouter.get("/", async (req, res) => {
  const { limit, offset } = pageParams(req);
  res.json(
    await query(
      `SELECT al.id, al.title, COALESCE(al.poster_url, al.cover_url) AS cover_url, al.artist_id, ar.name AS artist_name
       FROM albums al JOIN artists ar ON ar.id = al.artist_id
       WHERE al.status = 'published'
       ORDER BY al.created_at DESC, al.id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
  );
});

albumsRouter.get("/:id", async (req, res) => {
  const [album] = await query(
    `SELECT al.id, al.title, COALESCE(al.poster_url, al.cover_url) AS cover_url, al.artist_id, ar.name AS artist_name
     FROM albums al JOIN artists ar ON ar.id = al.artist_id WHERE al.id = $1 AND al.status = 'published'`,
    [req.params.id],
  );
  if (!album) return res.status(404).json({ error: "Album not found" });
  res.json(album);
});

albumsRouter.get("/:id/songs", async (req, res) => {
  res.json(
    await query(`${SONG_SELECT} WHERE s.album_id = $1 AND ${PUBLISHED} ORDER BY s.track_number NULLS LAST, s.id`, [req.params.id]),
  );
});

// --- genres --------------------------------------------------------------

genresRouter.get("/", async (_req, res) => {
  res.json(await query("SELECT id, name FROM genres ORDER BY name"));
});

// --- movies (soundtracks) ------------------------------------------------

const MOVIE_SELECT = `
  SELECT al.id, al.title, al.description, al.release_year, al.language, al.music_director,
         COALESCE(al.poster_url, al.cover_url) AS poster_url, al.artist_id, ar.name AS artist_name,
         (SELECT COUNT(*)::int FROM songs s WHERE s.album_id = al.id AND s.status = 'published') AS song_count
  FROM albums al JOIN artists ar ON ar.id = al.artist_id`;

moviesRouter.get("/", async (req, res) => {
  const { limit, offset } = pageParams(req);
  const where = ["al.status = 'published'"];
  const params: unknown[] = [];

  const text = String(req.query.q ?? "").trim();
  if (text) {
    params.push(likePattern(text));
    const n = params.length;
    where.push(`(al.title ILIKE $${n} OR al.music_director ILIKE $${n} OR ar.name ILIKE $${n})`);
  }
  const language = String(req.query.language ?? "").trim();
  if (language) {
    params.push(language);
    where.push(`lower(COALESCE(al.language, '')) = lower($${params.length})`);
  }

  params.push(limit, offset);
  res.json(
    await query(
      `${MOVIE_SELECT} WHERE ${where.join(" AND ")} ORDER BY al.created_at DESC, al.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
  );
});

moviesRouter.get("/:id", async (req, res) => {
  const [movie] = await query(`${MOVIE_SELECT} WHERE al.id = $1 AND al.status = 'published'`, [req.params.id]);
  if (!movie) return res.status(404).json({ error: "Movie not found" });
  const songs = await query(
    `${SONG_SELECT} WHERE s.album_id = $1 AND ${PUBLISHED} ORDER BY s.track_number NULLS LAST, s.id`,
    [req.params.id],
  );
  res.json({ ...movie, songs });
});

moodsRouter.get("/", async (_req, res) => {
  res.json(
    await query(
      `SELECT m.slug, m.name, COUNT(s.id)::int AS song_count
       FROM moods m
       LEFT JOIN song_moods sm ON sm.mood_id = m.id
       LEFT JOIN songs s ON s.id = sm.song_id AND s.status = 'published'
       GROUP BY m.id ORDER BY m.name`,
    ),
  );
});

export { SONG_SELECT, PUBLISHED };
