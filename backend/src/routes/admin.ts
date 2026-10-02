import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../auth";
import { query } from "../db";
import { approvePredictedLabels, rejectPrediction } from "../classifier/store";
import { classifyExistingSong, reclassifyMovie } from "../classifier/rerun";
import { suggest } from "../moodRules";
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

/** A movie is an album with extra details. New movies start as drafts until the admin publishes them. */
adminRouter.post("/albums", upload.single("cover"), async (req, res) => {
  const parsed = z
    .object({
      title: z.string().trim().min(1),
      artistId: z.coerce.number().int(),
      description: z.string().trim().max(2000).optional(),
      releaseYear: z.coerce.number().int().min(1900).max(2100).optional(),
      language: z.string().trim().max(60).optional(),
      musicDirector: z.string().trim().max(200).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "title and artistId required" });
  const d = parsed.data;
  const image = await mediaUrl(req.file);
  const [album] = await query(
    `INSERT INTO albums (title, artist_id, cover_url, poster_url, description, release_year, language, music_director, status)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'draft') RETURNING *`,
    [d.title, d.artistId, image, d.description ?? null, d.releaseYear ?? null, d.language ?? null, d.musicDirector ?? null],
  );
  res.status(201).json(album);
});

const albumPatch = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    releaseYear: z.number().int().min(1900).max(2100).nullable().optional(),
    language: z.string().trim().max(60).nullable().optional(),
    musicDirector: z.string().trim().max(200).nullable().optional(),
    status: z.enum(["draft", "published"]).optional(),
  })
  .strict();

adminRouter.patch("/albums/:id", async (req, res) => {
  const parsed = albumPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const columns: Record<string, string> = { title: "title", description: "description", releaseYear: "release_year", language: "language", musicDirector: "music_director", status: "status" };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    values.push(value);
    sets.push(`${columns[key]} = $${values.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: "Nothing to change" });
  values.push(req.params.id);
  const rows = await query(`UPDATE albums SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`, values);
  if (!rows.length) return res.status(404).json({ error: "Movie not found" });
  res.json(rows[0]);
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
        downloadable: z.enum(["true", "false", "on"]).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const audio = parsed.data.audioUrl ?? (await mediaUrl(files?.audio?.[0]));
    if (!audio) return res.status(400).json({ error: "audio file or audioUrl required" });

    const d = parsed.data;
    const [song] = await query(
      `INSERT INTO songs (title, artist_id, album_id, genre_id, audio_url, cover_url, duration, downloadable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [d.title, d.artistId, d.albumId ?? null, d.genreId ?? null, audio, await mediaUrl(files?.cover?.[0]), d.duration, d.downloadable === "true" || d.downloadable === "on"],
    );
    res.status(201).json(song);
  },
);

const songPatch = z
  .object({
    downloadable: z.boolean().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    singers: z.string().trim().max(300).nullable().optional(),
    lyricist: z.string().trim().max(300).nullable().optional(),
    musicDirector: z.string().trim().max(300).nullable().optional(),
    trackNumber: z.number().int().min(0).max(999).nullable().optional(),
    language: z.string().trim().max(60).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    // "suggested" = produced by the keyword rules and not yet confirmed; "manual" = written or confirmed by an admin
    descriptionSource: z.enum(["manual", "suggested"]).optional(),
    status: z.enum(["draft", "published"]).optional(),
    moods: z
      .array(z.object({ slug: z.string().max(40), primary: z.boolean().optional(), source: z.enum(["manual", "suggested"]).optional(), confidence: z.number().min(0).max(1).optional() }))
      .max(6)
      .optional(),
  })
  .strict();

const SONG_COLUMNS: Record<string, string> = {
  downloadable: "downloadable",
  title: "title",
  singers: "singers",
  lyricist: "lyricist",
  musicDirector: "music_director",
  trackNumber: "track_number",
  language: "language",
  description: "description",
  descriptionSource: "description_source",
  status: "status",
};

/** Edits any song detail. Writing a description by hand marks it as verified ("manual") unless told otherwise. */
adminRouter.patch("/songs/:id", async (req, res) => {
  const parsed = songPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { moods, ...fields } = parsed.data;
  if (fields.description !== undefined && fields.descriptionSource === undefined) fields.descriptionSource = "manual";

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    values.push(value);
    sets.push(`${SONG_COLUMNS[key]} = $${values.length}`);
  }
  if (!sets.length && !moods) return res.status(400).json({ error: "Nothing to change" });

  let song: { id: number; downloadable: boolean } | undefined;
  if (sets.length) {
    values.push(req.params.id);
    [song] = await query(`UPDATE songs SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING id, downloadable, status`, values);
  } else {
    [song] = await query("SELECT id, downloadable, status FROM songs WHERE id = $1", [req.params.id]);
  }
  if (!song) return res.status(404).json({ error: "Song not found" });

  if (moods) {
    await query("DELETE FROM song_moods WHERE song_id = $1", [song.id]);
    // Only one primary mood; the first one flagged wins, or the first in the list.
    const primaryIndex = Math.max(0, moods.findIndex((m) => m.primary));
    for (const [i, m] of moods.entries()) {
      await query(
        "INSERT INTO song_moods (song_id, mood_id, is_primary, source, confidence) SELECT $1, id, $3, $4, $5 FROM moods WHERE slug = $2 ON CONFLICT DO NOTHING",
        [song.id, m.slug, i === primaryIndex, m.source ?? "manual", m.confidence ?? null],
      );
    }
    // The admin's list is the whole truth for this song. Once they have saved approved labels, the classification is reviewed.
    if (moods.some((m) => (m.source ?? "manual") === "manual")) {
      await query("UPDATE song_classifications SET review_status = 'approved', updated_at = now() WHERE song_id = $1", [song.id]);
    }
  }
  res.json(song);
});

/** Every song of a movie in any state, for the admin review screen. */
adminRouter.get("/movies/:id/songs", async (req, res) => {
  res.json(
    await query(
      `SELECT s.id, s.title, s.audio_url, s.duration, s.singers, s.lyricist, s.music_director, s.track_number, s.language,
              s.description, s.description_source, s.status, s.downloadable, s.format, s.file_size,
              (SELECT COALESCE(json_agg(json_build_object('slug', m.slug, 'primary', sm.is_primary, 'source', sm.source, 'confidence', sm.confidence)
                                        ORDER BY sm.is_primary DESC, m.slug), '[]'::json)
                 FROM song_moods sm JOIN moods m ON m.id = sm.mood_id WHERE sm.song_id = s.id) AS moods,
              (SELECT json_build_object('labels', c.labels, 'method', c.method, 'model_version', c.model_version,
                                        'review_status', c.review_status, 'error', c.error, 'features', c.features)
                 FROM song_classifications c WHERE c.song_id = s.id) AS classification
       FROM songs s WHERE s.album_id = $1 ORDER BY s.track_number NULLS LAST, s.id`,
      [req.params.id],
    ),
  );
});

/** All movies in any state, with how many songs are drafts or published. */
adminRouter.get("/movies", async (_req, res) => {
  res.json(
    await query(
      `SELECT al.id, al.title, al.status, al.language, al.release_year, al.music_director, al.description,
              COALESCE(al.poster_url, al.cover_url) AS poster_url, ar.name AS artist_name,
              COUNT(s.id) FILTER (WHERE s.status = 'published')::int AS published_songs,
              COUNT(s.id) FILTER (WHERE s.status = 'draft')::int AS draft_songs
       FROM albums al JOIN artists ar ON ar.id = al.artist_id LEFT JOIN songs s ON s.album_id = al.id
       GROUP BY al.id, ar.name ORDER BY al.created_at DESC, al.id DESC`,
    ),
  );
});

/** Publishes the movie and every draft song in it. Songs unpublished one by one stay hidden. */
adminRouter.post("/movies/:id/publish", async (req, res) => {
  const [movie] = await query("SELECT id FROM albums WHERE id = $1", [req.params.id]);
  if (!movie) return res.status(404).json({ error: "Movie not found" });
  const [{ drafts }] = await query<{ drafts: number }>("SELECT COUNT(*)::int AS drafts FROM songs WHERE album_id = $1 AND status = 'draft'", [movie.id]);
  const [{ total }] = await query<{ total: number }>("SELECT COUNT(*)::int AS total FROM songs WHERE album_id = $1", [movie.id]);
  if (total === 0) return res.status(400).json({ error: "Add at least one song before publishing." });
  await query("UPDATE songs SET status = 'published' WHERE album_id = $1 AND status = 'draft'", [movie.id]);
  await query("UPDATE albums SET status = 'published' WHERE id = $1", [movie.id]);
  res.json({ published: drafts });
});

/** Saves a new track order: songIds[0] becomes track 1, and so on. */
adminRouter.put("/movies/:id/order", async (req, res) => {
  const parsed = z.object({ songIds: z.array(z.number().int()).min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "songIds required" });
  for (const [i, id] of parsed.data.songIds.entries()) {
    await query("UPDATE songs SET track_number = $1 WHERE id = $2 AND album_id = $3", [i + 1, id, req.params.id]);
  }
  res.status(204).end();
});

/**
 * Suggested description and moods for one song, from its title, movie, genre, language and singers only.
 * It never analyses the audio. The admin reviews and saves (or ignores) it.
 */
adminRouter.get("/songs/:id/suggest", async (req, res) => {
  const [song] = await query(
    `SELECT s.title, s.singers, s.music_director, s.language, g.name AS genre,
            al.title AS movie, al.release_year, al.language AS movie_language, al.music_director AS movie_director
     FROM songs s LEFT JOIN albums al ON al.id = s.album_id LEFT JOIN genres g ON g.id = s.genre_id WHERE s.id = $1`,
    [req.params.id],
  );
  if (!song) return res.status(404).json({ error: "Song not found" });
  res.json({
    ...suggest({
      title: song.title,
      movie: song.movie,
      genre: song.genre,
      language: song.language ?? song.movie_language,
      singers: song.singers,
      musicDirector: song.music_director ?? song.movie_director,
      releaseYear: song.release_year,
    }),
    source: "suggested",
  });
});

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

// --- classification review ---------------------------------------------------

/** Approve or reject the classifier's suggestions for one song. Approving copies them into the song's real labels. */
adminRouter.post("/songs/:id/classification", async (req, res) => {
  const parsed = z.object({ action: z.enum(["approve", "reject"]), slugs: z.array(z.string().max(40)).max(10).optional(), includeLowConfidence: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "action must be approve or reject" });
  const id = Number(req.params.id);
  const [song] = await query("SELECT id FROM songs WHERE id = $1", [id]);
  if (!song) return res.status(404).json({ error: "Song not found" });
  if (parsed.data.action === "reject") {
    await rejectPrediction(id);
    return res.json({ rejected: true });
  }
  const added = await approvePredictedLabels(id, { minConfidence: parsed.data.includeLowConfidence ? 0 : 0.5, only: parsed.data.slugs });
  res.json({ approved: added });
});

/** Run the classifier again on one song. Only the suggestions change; approved labels are never touched. */
adminRouter.post("/songs/:id/classify", async (req, res) => {
  try {
    const outcome = await classifyExistingSong(Number(req.params.id), req.body?.force === true);
    if (outcome === "missing") return res.status(404).json({ error: "Song not found" });
    res.json({ outcome });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Classification failed" });
  }
});

/** Approve the suggestions of every song in a movie that is not flagged for manual review (unless told to include those). */
adminRouter.post("/movies/:id/approve-labels", async (req, res) => {
  const includeLow = req.body?.includeLowConfidence === true;
  const songs = await query<{ song_id: number }>(
    `SELECT c.song_id FROM song_classifications c JOIN songs s ON s.id = c.song_id
     WHERE s.album_id = $1 AND c.review_status IN ('pending'${includeLow ? ", 'needs_review'" : ""})`,
    [req.params.id],
  );
  let approved = 0;
  for (const s of songs) approved += await approvePredictedLabels(s.song_id, { minConfidence: includeLow ? 0.35 : 0.5 });
  res.json({ songs: songs.length, labels: approved });
});

/** Re-run the classifier on every song of a movie in the background. */
adminRouter.post("/movies/:id/classify", async (req, res) => {
  const songs = await query<{ id: number }>("SELECT id FROM songs WHERE album_id = $1 ORDER BY track_number NULLS LAST, id", [req.params.id]);
  reclassifyMovie(songs.map((s) => s.id), req.body?.force === true);
  res.status(202).json({ queued: songs.length });
});

/** The label vocabulary, grouped by kind, for the review screen. */
adminRouter.get("/labels", async (_req, res) => {
  res.json(await query("SELECT slug, name, kind FROM moods ORDER BY CASE kind WHEN 'style' THEN 0 WHEN 'mood' THEN 1 ELSE 2 END, name"));
});
