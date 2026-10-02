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
    const [album] = await query<AlbumRow>("SELECT id, artist_id, language FROM albums WHERE id = $1", [job.album_id]);

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

uploadsRouter.post("/", upload.single("zip"), async (req: AuthedRequest, res) => {
  const cleanup = () => (req.file ? fs.rm(req.file.path, { force: true }) : undefined);
  const parsed = z.object({ albumId: z.coerce.number().int(), rightsConfirmed: z.literal("true") }).safeParse(req.body);
  if (!req.file) return res.status(400).json({ error: "Choose a .zip file" });
  if (!parsed.success) {
    await cleanup();
    return res.status(400).json({ error: "Choose a movie and confirm you have the right to distribute these songs." });
  }
  const [album] = await query("SELECT id FROM albums WHERE id = $1", [parsed.data.albumId]);
  if (!album) {
    await cleanup();
    return res.status(404).json({ error: "Movie not found" });
  }

  const [job] = await query(
    "INSERT INTO upload_jobs (album_id, created_by, filename, rights_confirmed) VALUES ($1, $2, $3, TRUE) RETURNING id",
    [album.id, req.userId, req.file.originalname.slice(0, 200)],
  );
  const zipPath = req.file.path;
  void enqueue(() => processJob(job.id, zipPath));
  res.status(202).json({ jobId: job.id });
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

