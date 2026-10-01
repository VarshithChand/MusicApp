import { Router } from "express";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export const appRouter = Router();

// Newest Android build that passed the launch test (published by GitHub Actions).
const APK_URL = "https://github.com/VarshithChand/MusicApp/releases/latest/download/music.apk";

/**
 * Streams the APK to the browser. The web app fetches this (GitHub itself blocks cross-site fetches)
 * so it can show download progress and save the file without sending the user to GitHub.
 */
appRouter.get("/download", async (_req, res) => {
  const upstream = await fetch(APK_URL, { redirect: "follow" });
  if (!upstream.ok || !upstream.body) {
    return res.status(404).json({ error: "The Android app isn't available yet. Please try again later." });
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", 'attachment; filename="music.apk"');
  res.setHeader("Access-Control-Expose-Headers", "Content-Length");
  const length = upstream.headers.get("content-length");
  if (length) res.setHeader("Content-Length", length);

  try {
    await pipeline(Readable.fromWeb(upstream.body as any), res);
  } catch {
    // The client went away mid-download; nothing more to send.
    res.destroy();
  }
});
