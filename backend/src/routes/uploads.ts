import crypto from "crypto";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import { parseFile } from "music-metadata";
import multer from "multer";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import yauzl from "yauzl";
import { Router } from "express";
import { z } from "zod";
import { AuthedRequest, requireAdmin, requireAuth } from "../auth";
import { query } from "../db";
import { classifySong } from "../classifier/classify";
import { findCached, savePrediction } from "../classifier/store";
import { SongInfo } from "../moodRules";
import { chooseMovieName, findMovieMatches, suggestMovieName } from "../movieName";
import { saveBuffer } from "../storage";
import {
  AUDIO_MIME,
  classifyEntry,
  detectAudioFormat,
  formatMatches,
  MAX_ENTRIES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_ZIP_BYTES,
  titleFromFileName,
} from "../zipRules";

/**
 * Admin ZIP upload of a movie soundtrack.
 *  1. The archive is streamed to a temp file (never held in memory).
 *  2. A background job checks every entry, extracts safe audio files one at a time, and saves each as a DRAFT song.
 *  3. Nothing is public until the admin reviews the drafts and publishes the movie.
 * Re-uploading the same ZIP is safe: files already stored are matched by SHA-256 and skipped.
 */
export const uploadsRouter = Router();
uploadsRouter.use(requireAuth, requireAdmin);

const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir(), filename: (_req, _file, cb) => cb(null, `upload-${crypto.randomUUID()}.zip`) }),
  limits: { fileSize: MAX_ZIP_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, path.extname(file.originalname).toLowerCase() === ".zip"),
});

// One archive at a time: Render's free plan has 512 MB of memory.
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>) => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

const openZip = (file: string) =>
  new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => (err || !zip ? reject(err ?? new Error("Could not read the ZIP")) : resolve(zip))),
  );

const openEntry = (zip: yauzl.ZipFile, entry: yauzl.Entry) =>
  new Promise<Readable>((resolve, reject) => zip.openReadStream(entry, (err, stream) => (err || !stream ? reject(err ?? new Error("Could not read file")) : resolve(stream))));

async function recordItem(jobId: number, fileName: string, status: "ok" | "rejected" | "duplicate", fields: { reason?: string; songId?: number; sha256?: string; size?: number } = {}) {
  await query("INSERT INTO upload_job_items (job_id, file_name, status, reason, song_id, sha256, size) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    jobId,
    fileName,
    status,
    fields.reason ?? null,
    fields.songId ?? null,
    fields.sha256 ?? null,
    fields.size ?? null,
  ]);
  await query("UPDATE upload_jobs SET processed_files = processed_files + 1, updated_at = now() WHERE id = $1", [jobId]);
}

interface AlbumRow {
  id: number;
  artist_id: number;
  language: string | null;
  title: string;
  release_year: number | null;
  music_director: string | null;
}

/**
 * Suggests labels for a freshly saved song and stores them as PREDICTIONS (never as approved labels).
 * Reuses an earlier result for identical audio, and never lets a classifier problem fail the upload.
 */
async function classifyAndStore(songId: number, tempFile: string, publicUrl: string, meta: SongInfo & { durationSeconds?: number }, sha256: string) {
  try {
    const result = (await findCached(sha256)) ?? (await classifySong(tempFile, meta, publicUrl));
    await savePrediction(songId, result, sha256);
  } catch (err) {
    console.error(`classification of song ${songId} failed (the song itself was saved):`, err);
  }
}

/** Streams one ZIP entry to a temp file while hashing it and enforcing the size cap. */
async function extractToTemp(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<{ file: string; sha256: string; size: number }> {
  const file = path.join(os.tmpdir(), `entry-${crypto.randomUUID()}`);
  const hash = crypto.createHash("sha256");
  let size = 0;
  const source = await openEntry(zip, entry);
  source.on("data", (chunk: Buffer) => {
    size += chunk.length;
    hash.update(chunk);
    // Guards against archives that lie about their size (zip bombs).
    if (size > MAX_FILE_BYTES) source.destroy(new Error("The file is larger than 80 MB"));
  });
  await pipeline(source, createWriteStream(file));
  return { file, sha256: hash.digest("hex"), size };
}

async function processEntry(jobId: number, album: AlbumRow, zip: yauzl.ZipFile, entry: yauzl.Entry, seen: Set<string>) {
  const verdict = classifyEntry(entry.fileName, entry.uncompressedSize, entry.externalFileAttributes);
  if (verdict.kind === "ignore") return;
  if (verdict.kind === "reject") return recordItem(jobId, entry.fileName, "rejected", { reason: verdict.reason });

  let temp: string | null = null;
  try {
    const extracted = await extractToTemp(zip, entry);
    temp = extracted.file;

    const handle = await fs.open(temp, "r");
    const header = Buffer.alloc(12);
    await handle.read(header, 0, 12, 0);
    await handle.close();
    if (!formatMatches(verdict.format, detectAudioFormat(header))) {
      return recordItem(jobId, entry.fileName, "rejected", { reason: `Not a valid ${verdict.format.toUpperCase()} file`, size: extracted.size });
    }

    // Duplicate: same bytes already in this movie, or earlier in this archive.
    const [existing] = await query("SELECT id FROM songs WHERE file_sha256 = $1 AND album_id = $2 LIMIT 1", [extracted.sha256, album.id]);
    if (existing || seen.has(extracted.sha256)) {
      return recordItem(jobId, entry.fileName, "duplicate", { reason: "This exact file is already in the movie", songId: existing?.id, sha256: extracted.sha256, size: extracted.size });
    }
    seen.add(extracted.sha256);

    // Tags are only a convenience; the admin confirms everything. A broken tag block never fails the upload.
    let tags: Awaited<ReturnType<typeof parseFile>> | null = null;
    try {
      tags = await parseFile(temp, { duration: true });
    } catch {
      tags = null;
    }
    const fromName = titleFromFileName(verdict.baseName);
    const title = tags?.common.title?.trim() || fromName.title;
    const track = tags?.common.track?.no ?? fromName.track;
    const singers = tags?.common.artists?.join(", ") || tags?.common.artist || null;

    const url = await saveBuffer(await fs.readFile(temp), path.extname(verdict.baseName), AUDIO_MIME[verdict.format]);
    const [song] = await query(
      `INSERT INTO songs (title, artist_id, album_id, audio_url, duration, singers, lyricist, music_director, track_number, language,
                          status, file_sha256, file_size, format)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $12, $13) RETURNING id`,
      [
        title,
        album.artist_id,
        album.id,
        url,
        Math.round(tags?.format.duration ?? 0),
        singers,
        tags?.common.lyricist?.join(", ") || null,
        tags?.common.composer?.join(", ") || null,
        track,
        album.language,
        extracted.sha256,
        extracted.size,
        verdict.format,
      ],
    );
    await classifyAndStore(
      song.id,
      temp,
      url,
      { title, movie: album.title, language: album.language, singers, musicDirector: album.music_director, releaseYear: album.release_year, durationSeconds: Math.round(tags?.format.duration ?? 0) },
      extracted.sha256,
    );
    await recordItem(jobId, entry.fileName, "ok", { songId: song.id, sha256: extracted.sha256, size: extracted.size });
  } catch (err) {
    await recordItem(jobId, entry.fileName, "rejected", { reason: err instanceof Error ? err.message : "Could not process this file" });
  } finally {
    if (temp) await fs.rm(temp, { force: true });
  }
}

async function processJob(jobId: number, zipPath: string) {
  try {
    const [job] = await query("SELECT album_id FROM upload_jobs WHERE id = $1", [jobId]);
    const [album] = await query<AlbumRow>("SELECT id, artist_id, language, title, release_year, music_director FROM albums WHERE id = $1", [job.album_id]);

    let zip: yauzl.ZipFile;
    try {
      zip = await openZip(zipPath); // yauzl itself refuses archives with absolute paths, "..", or backslashes
    } catch (err) {
      throw new Error(`This isn't a usable ZIP file (${err instanceof Error ? err.message : "unreadable"})`);
    }
    if (zip.entryCount > MAX_ENTRIES) {
      zip.close();
      throw new Error(`The archive has ${zip.entryCount} files; the limit is ${MAX_ENTRIES}`);
    }
    await query("UPDATE upload_jobs SET total_files = $1 WHERE id = $2", [zip.entryCount, jobId]);

    const seen = new Set<string>();
    let declaredTotal = 0;
    await new Promise<void>((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry: yauzl.Entry) => {
        declaredTotal += entry.uncompressedSize;
        if (declaredTotal > MAX_TOTAL_BYTES) {
          zip.close();
          return reject(new Error("The archive would expand to more than 500 MB"));
        }
        processEntry(jobId, album, zip, entry, seen).then(() => zip.readEntry(), reject);
      });
      zip.readEntry();
    });

    const [{ ok }] = await query<{ ok: number }>("SELECT COUNT(*)::int AS ok FROM upload_job_items WHERE job_id = $1 AND status IN ('ok','duplicate')", [jobId]);
    if (ok === 0) throw new Error("No usable audio files were found in the archive");
    await query("UPDATE upload_jobs SET status = 'review', updated_at = now() WHERE id = $1", [jobId]);
  } catch (err) {
    console.error(`upload job ${jobId} failed:`, err);
    await query("UPDATE upload_jobs SET status = 'failed', error = $1, updated_at = now() WHERE id = $2", [err instanceof Error ? err.message : "Processing failed", jobId]);
  } finally {
    await fs.rm(zipPath, { force: true });
  }
}

/** A restart (Render sleeps and redeploys) kills in-flight jobs; mark them failed so the admin can simply re-upload. */
export async function failInterruptedJobs() {
  await query("UPDATE upload_jobs SET status = 'failed', error = 'Interrupted by a server restart. Upload the ZIP again; files already saved are skipped.', updated_at = now() WHERE status = 'processing'");
}

/** Finds an artist by name or creates it. New movies need a credited artist; "Various Artists" is used when none is known. */
async function artistIdFor(name: string): Promise<number> {
  const [found] = await query("SELECT id FROM artists WHERE lower(name) = lower($1) LIMIT 1", [name]);
  if (found) return found.id;
  const [created] = await query("INSERT INTO artists (name) VALUES ($1) RETURNING id", [name]);
  return created.id;
}

/** Tells the admin what movie name a ZIP file name suggests, and which existing movies it might duplicate. */
uploadsRouter.post("/suggest-movie", async (req, res) => {
  const parsed = z.object({ filename: z.string().min(1).max(300) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "filename required" });
  const suggestion = suggestMovieName(parsed.data.filename);
  const existing = await query<{ id: number; title: string }>("SELECT id, title FROM albums");
  res.json({ ...suggestion, matches: suggestion.name ? findMovieMatches(suggestion.name, existing) : [] });
});

const uploadFields = z.object({
  rightsConfirmed: z.literal("true"),
  // Either an existing movie...
  albumId: z.coerce.number().int().optional(),
  // ...or details for a new one. The name is optional: it falls back to the ZIP file name.
  movieName: z.string().trim().max(200).optional(),
  confirmName: z.enum(["true", "false"]).optional(), // the admin has confirmed an ambiguous suggested name
  createAnyway: z.enum(["true", "false"]).optional(), // the admin has seen the possible duplicates and wants a new movie
  language: z.string().trim().max(60).optional(),
  releaseYear: z.coerce.number().int().min(1900).max(2100).optional(),
  musicDirector: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
});

uploadsRouter.post("/", upload.single("zip"), async (req: AuthedRequest, res) => {
  const file = req.file;
  const reject = async (status: number, body: Record<string, unknown>) => {
    if (file) await fs.rm(file.path, { force: true });
    return res.status(status).json(body);
  };

  if (!file) return res.status(400).json({ error: "Choose a .zip file" });
  const parsed = uploadFields.safeParse(req.body);
  if (!parsed.success) return reject(400, { error: "Confirm you have the right to distribute these songs, and check the movie details." });
  const d = parsed.data;

  let albumId = d.albumId;
  let movieName: string;
  let nameSource: "existing" | "manual" | "filename" = "existing";

  if (albumId) {
    // Adding songs to a movie that already exists.
    const [album] = await query("SELECT id, title FROM albums WHERE id = $1", [albumId]);
    if (!album) return reject(404, { error: "Movie not found" });
    movieName = album.title;
  } else {
    // A new movie. Name priority: what the admin typed, else the ZIP file name; a vague file name must be confirmed first.
    const choice = chooseMovieName(d.movieName, file.originalname, d.confirmName === "true");
    if (!choice.ok) {
      return reject(409, {
        code: "confirm-name",
        error: choice.suggestion.name
          ? `The file name "${file.originalname}" is too vague to be sure of the movie's name. Confirm "${choice.suggestion.name}" or type the real name.`
          : "Type the movie's name: the file name doesn't contain one.",
        suggestion: choice.suggestion,
      });
    }
    movieName = choice.name;
    nameSource = choice.source;

    // Never create a duplicate silently: show the existing movies and let the admin pick one.
    const existing = await query<{ id: number; title: string }>("SELECT id, title FROM albums");
    const matches = findMovieMatches(movieName, existing);
    if (matches.length && d.createAnyway !== "true") {
      return reject(409, { code: "duplicate", error: `A movie called "${matches[0].title}" already exists. Add the songs to it, or create a separate movie.`, name: movieName, matches });
    }

    const artistId = await artistIdFor(d.musicDirector || "Various Artists");
    // New movies are always drafts: nothing is public until the admin reviews and publishes.
    const [album] = await query(
      `INSERT INTO albums (title, artist_id, description, release_year, language, music_director, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id`,
      [movieName, artistId, d.description ?? null, d.releaseYear ?? choice.releaseYear ?? null, d.language ?? null, d.musicDirector ?? null],
    );
    albumId = album.id;
  }

  const [job] = await query(
    "INSERT INTO upload_jobs (album_id, created_by, filename, rights_confirmed) VALUES ($1, $2, $3, TRUE) RETURNING id",
    [albumId, req.userId, file.originalname.slice(0, 200)],
  );
  void enqueue(() => processJob(job.id, file.path));
  res.status(202).json({ jobId: job.id, movieId: albumId, movieName, nameSource });
});

uploadsRouter.get("/", async (_req, res) => {
  res.json(
    await query(
      `SELECT j.id, j.status, j.filename, j.total_files, j.processed_files, j.error, j.created_at, a.title AS movie
       FROM upload_jobs j JOIN albums a ON a.id = j.album_id ORDER BY j.id DESC LIMIT 30`,
    ),
  );
});

uploadsRouter.get("/:id", async (req, res) => {
  const [job] = await query(
    `SELECT j.id, j.album_id, j.status, j.filename, j.total_files, j.processed_files, j.error, j.created_at, a.title AS movie
     FROM upload_jobs j JOIN albums a ON a.id = j.album_id WHERE j.id = $1`,
    [req.params.id],
  );
  if (!job) return res.status(404).json({ error: "Upload not found" });
  const items = await query("SELECT id, file_name, status, reason, song_id, size FROM upload_job_items WHERE job_id = $1 ORDER BY id", [job.id]);
  res.json({ job, items });
});

