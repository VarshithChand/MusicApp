import crypto from "crypto";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { query } from "../db";
import { classifySong } from "./classify";
import { findCached, savePrediction } from "./store";

const MAX_BYTES = 100 * 1024 * 1024;

/** Copies a song's audio (a storage URL or a local /media path) into a temporary file for analysis. */
async function downloadToTemp(audioUrl: string): Promise<string> {
  const target = path.join(os.tmpdir(), `reclassify-${crypto.randomUUID()}`);
  if (audioUrl.startsWith("/media/")) {
    await fs.copyFile(path.join(__dirname, "..", "..", "uploads", path.basename(audioUrl)), target);
    return target;
  }
  const res = await fetch(audioUrl, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`The audio file isn't reachable (${res.status})`);
  let size = 0;
  const source = Readable.fromWeb(res.body as any);
  source.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BYTES) source.destroy(new Error("The audio file is larger than 100 MB"));
  });
  try {
    await pipeline(source, createWriteStream(target));
  } catch (err) {
    await fs.rm(target, { force: true });
    throw err;
  }
  return target;
}

/**
 * Runs the classifier again on a saved song and replaces its PREDICTIONS. Approved labels are never changed.
 * `force` skips the result cache (use it when you want a fresh analysis of unchanged audio).
 */
export async function classifyExistingSong(songId: number, force = false): Promise<"classified" | "cached" | "missing"> {
  const [song] = await query(
    `SELECT s.id, s.title, s.audio_url, s.singers, s.music_director, s.language, s.duration, s.file_sha256,
            al.title AS movie, al.language AS movie_language, al.release_year, al.music_director AS movie_director
     FROM songs s LEFT JOIN albums al ON al.id = s.album_id WHERE s.id = $1`,
    [songId],
  );
  if (!song) return "missing";

  const sha: string | null = song.file_sha256;
  if (sha && !force) {
    const cached = await findCached(sha);
    if (cached) {
      await savePrediction(song.id, cached, sha);
      return "cached";
    }
  }

  const temp = await downloadToTemp(song.audio_url);
  try {
    const result = await classifySong(
      temp,
      {
        title: song.title,
        movie: song.movie,
        language: song.language ?? song.movie_language,
        singers: song.singers,
        musicDirector: song.music_director ?? song.movie_director,
        releaseYear: song.release_year,
        durationSeconds: song.duration,
      },
      song.audio_url.startsWith("http") ? song.audio_url : undefined,
    );
    await savePrediction(song.id, result, sha);
    return "classified";
  } finally {
    await fs.rm(temp, { force: true });
  }
}

// Re-classifying a whole movie runs one song at a time in the background (the free server has little memory).
let running: Promise<unknown> = Promise.resolve();
export function reclassifyMovie(songIds: number[], force = false) {
  running = running.then(async () => {
    for (const id of songIds) {
      try {
        await classifyExistingSong(id, force);
      } catch (err) {
        console.error(`re-classifying song ${id} failed:`, err);
      }
    }
  });
}
