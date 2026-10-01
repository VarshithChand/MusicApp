import { Router } from "express";
import { query } from "../db";
import { AuthedRequest, requireAuth } from "../auth";

export const songsRouter = Router();
export const artistsRouter = Router();
export const albumsRouter = Router();
export const genresRouter = Router();

const SONG_SELECT = `
  SELECT s.id, s.title, s.audio_url, s.cover_url, s.duration, s.play_count,
         s.artist_id, ar.name AS artist_name,
         s.album_id, al.title AS album_title,
         s.genre_id, g.name AS genre_name
  FROM songs s
  JOIN artists ar ON ar.id = s.artist_id
  LEFT JOIN albums al ON al.id = s.album_id
  LEFT JOIN genres g ON g.id = s.genre_id`;

function pageParams(req: { query: any }) {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  return { limit, offset };
}

// --- songs ---------------------------------------------------------------

songsRouter.get("/", async (req, res) => {
  const { limit, offset } = pageParams(req);
  const sort = req.query.sort === "popular" ? "s.play_count DESC, s.id DESC" : "s.created_at DESC, s.id DESC";
  res.json(await query(`${SONG_SELECT} ORDER BY ${sort} LIMIT $1 OFFSET $2`, [limit, offset]));
});

// Must be registered before "/:id".
songsRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ songs: [], artists: [], albums: [], genres: [] });
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;

  const [songs, artists, albums, genres] = await Promise.all([
    query(`${SONG_SELECT} WHERE s.title ILIKE $1 OR ar.name ILIKE $1 OR al.title ILIKE $1 OR g.name ILIKE $1 ORDER BY s.play_count DESC LIMIT 30`, [like]),
    query("SELECT id, name, image_url FROM artists WHERE name ILIKE $1 ORDER BY name LIMIT 20", [like]),
    query(
      `SELECT al.id, al.title, al.cover_url, al.artist_id, ar.name AS artist_name
       FROM albums al JOIN artists ar ON ar.id = al.artist_id
       WHERE al.title ILIKE $1 ORDER BY al.title LIMIT 20`,
      [like],
    ),
    query("SELECT id, name FROM genres WHERE name ILIKE $1 ORDER BY name LIMIT 20", [like]),
  ]);
  res.json({ songs, artists, albums, genres });
});

songsRouter.get("/:id", async (req, res) => {
  const [song] = await query(`${SONG_SELECT} WHERE s.id = $1`, [req.params.id]);
  if (!song) return res.status(404).json({ error: "Song not found" });
  res.json(song);
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
  res.json(await query(`${SONG_SELECT} WHERE s.artist_id = $1 ORDER BY s.play_count DESC, s.id`, [req.params.id]));
});

// --- albums --------------------------------------------------------------

albumsRouter.get("/", async (req, res) => {
  const { limit, offset } = pageParams(req);
  res.json(
    await query(
      `SELECT al.id, al.title, al.cover_url, al.artist_id, ar.name AS artist_name
       FROM albums al JOIN artists ar ON ar.id = al.artist_id
       ORDER BY al.created_at DESC, al.id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
  );
});

albumsRouter.get("/:id", async (req, res) => {
  const [album] = await query(
    `SELECT al.id, al.title, al.cover_url, al.artist_id, ar.name AS artist_name
     FROM albums al JOIN artists ar ON ar.id = al.artist_id WHERE al.id = $1`,
    [req.params.id],
  );
  if (!album) return res.status(404).json({ error: "Album not found" });
  res.json(album);
});

albumsRouter.get("/:id/songs", async (req, res) => {
  res.json(await query(`${SONG_SELECT} WHERE s.album_id = $1 ORDER BY s.id`, [req.params.id]));
});

// --- genres --------------------------------------------------------------

genresRouter.get("/", async (_req, res) => {
  res.json(await query("SELECT id, name FROM genres ORDER BY name"));
});

export { SONG_SELECT };
