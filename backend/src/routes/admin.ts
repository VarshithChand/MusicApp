import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../auth";
import { query } from "../db";
import { saveUpload } from "../storage";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.fieldname === "audio" ? file.mimetype.startsWith("audio/") : file.mimetype.startsWith("image/");
    cb(null, ok);
  },
});

const mediaUrl = async (f?: Express.Multer.File) => (f ? saveUpload(f) : null);

adminRouter.post("/genres", async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "name required" });
  const [genre] = await query(
    "INSERT INTO genres (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name",
    [parsed.data.name],
  );
  res.status(201).json(genre);
});

adminRouter.post("/artists", upload.single("image"), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "name required" });
  const [artist] = await query("INSERT INTO artists (name, image_url) VALUES ($1, $2) RETURNING *", [
    parsed.data.name,
    await mediaUrl(req.file),
  ]);
  res.status(201).json(artist);
});

adminRouter.post("/albums", upload.single("cover"), async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1), artistId: z.coerce.number().int() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "title and artistId required" });
  const [album] = await query("INSERT INTO albums (title, artist_id, cover_url) VALUES ($1, $2, $3) RETURNING *", [
    parsed.data.title,
    parsed.data.artistId,
    await mediaUrl(req.file),
  ]);
  res.status(201).json(album);
});

adminRouter.post(
  "/songs",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    const parsed = z
      .object({
        title: z.string().trim().min(1),
        artistId: z.coerce.number().int(),
        albumId: z.coerce.number().int().optional(),
        genreId: z.coerce.number().int().optional(),
        duration: z.coerce.number().int().min(0).default(0),
        audioUrl: z.string().url().optional(), // alternative to uploading a file
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const audio = parsed.data.audioUrl ?? (await mediaUrl(files?.audio?.[0]));
    if (!audio) return res.status(400).json({ error: "audio file or audioUrl required" });

    const d = parsed.data;
    const [song] = await query(
      `INSERT INTO songs (title, artist_id, album_id, genre_id, audio_url, cover_url, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [d.title, d.artistId, d.albumId ?? null, d.genreId ?? null, audio, await mediaUrl(files?.cover?.[0]), d.duration],
    );
    res.status(201).json(song);
  },
);

adminRouter.delete("/songs/:id", async (req, res) => {
  await query("DELETE FROM songs WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

adminRouter.get("/stats", async (_req, res) => {
  const [row] = await query(
    `SELECT (SELECT COUNT(*) FROM users)::int AS users, (SELECT COUNT(*) FROM songs)::int AS songs,
            (SELECT COUNT(*) FROM artists)::int AS artists, (SELECT COUNT(*) FROM albums)::int AS albums,
            (SELECT COUNT(*) FROM playlists)::int AS playlists`,
  );
  res.json(row);
});
