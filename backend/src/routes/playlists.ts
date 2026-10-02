import { Response, Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAuth } from "../auth";
import { query } from "../db";
import { PUBLISHED, SONG_SELECT } from "./catalog";

export const playlistsRouter = Router();
export const usersRouter = Router();

playlistsRouter.use(requireAuth);
usersRouter.use(requireAuth);

const nameSchema = z.object({ name: z.string().trim().min(1).max(100) });

/** Returns the playlist if it belongs to the caller, otherwise sends 404 and returns null. */
async function ownedPlaylist(req: AuthedRequest, res: Response) {
  const [playlist] = await query("SELECT id, name, created_at FROM playlists WHERE id = $1 AND user_id = $2", [
    req.params.id,
    req.userId,
  ]);
  if (!playlist) res.status(404).json({ error: "Playlist not found" });
  return playlist ?? null;
}

playlistsRouter.get("/", async (req: AuthedRequest, res) => {
  res.json(
    await query(
      `SELECT p.id, p.name, p.created_at, COUNT(ps.song_id)::int AS song_count
       FROM playlists p LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
       WHERE p.user_id = $1 GROUP BY p.id ORDER BY p.created_at DESC`,
      [req.userId],
    ),
  );
});

playlistsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "name required" });
  const [playlist] = await query("INSERT INTO playlists (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at", [
    req.userId,
    parsed.data.name,
  ]);
  res.status(201).json(playlist);
});

playlistsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const playlist = await ownedPlaylist(req, res);
  if (!playlist) return;
  const songs = await query(
    `${SONG_SELECT} JOIN playlist_songs ps ON ps.song_id = s.id
     WHERE ps.playlist_id = $1 AND ${PUBLISHED} ORDER BY ps.position, ps.added_at`,
    [playlist.id],
  );
  res.json({ ...playlist, songs });
});

playlistsRouter.put("/:id", async (req: AuthedRequest, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "name required" });
  const [playlist] = await query(
    "UPDATE playlists SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name, created_at",
    [parsed.data.name, req.params.id, req.userId],
  );
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  res.json(playlist);
});

playlistsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  await query("DELETE FROM playlists WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
  res.status(204).end();
});

playlistsRouter.post("/:id/songs", async (req: AuthedRequest, res) => {
  const parsed = z.object({ songId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "songId required" });
  const playlist = await ownedPlaylist(req, res);
  if (!playlist) return;
  const song = await query("SELECT id FROM songs WHERE id = $1", [parsed.data.songId]);
  if (!song.length) return res.status(404).json({ error: "Song not found" });
  await query(
    `INSERT INTO playlist_songs (playlist_id, song_id, position)
     VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM playlist_songs WHERE playlist_id = $1), 0))
     ON CONFLICT DO NOTHING`,
    [playlist.id, parsed.data.songId],
  );
  res.status(204).end();
});

playlistsRouter.delete("/:id/songs/:songId", async (req: AuthedRequest, res) => {
  const playlist = await ownedPlaylist(req, res);
  if (!playlist) return;
  await query("DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2", [playlist.id, req.params.songId]);
  res.status(204).end();
});

// --- /users/me ------------------------------------------------------------

usersRouter.get("/me/liked-songs", async (req: AuthedRequest, res) => {
  res.json(
    await query(`${SONG_SELECT} JOIN likes l ON l.song_id = s.id WHERE l.user_id = $1 AND ${PUBLISHED} ORDER BY l.created_at DESC`, [
      req.userId,
    ]),
  );
});

usersRouter.get("/me/recently-played", async (req: AuthedRequest, res) => {
  res.json(
    await query(
      `${SONG_SELECT} JOIN recently_played rp ON rp.song_id = s.id
       WHERE rp.user_id = $1 AND ${PUBLISHED} ORDER BY rp.played_at DESC LIMIT 20`,
      [req.userId],
    ),
  );
});
