import "dotenv/config";
import "express-async-errors"; // Express 4 does not forward rejected async handlers to the error middleware
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import { adminRouter } from "./routes/admin";
import { appRouter } from "./routes/app";
import { authRouter } from "./routes/auth";
import { albumsRouter, artistsRouter, genresRouter, moodsRouter, moviesRouter, songsRouter } from "./routes/catalog";
import { discoverRouter, startLibraryTopUp, youtubeStatus } from "./routes/discover";
import { playlistsRouter, usersRouter } from "./routes/playlists";
import { failInterruptedJobs, uploadsRouter } from "./routes/uploads";
import { closeStore, ready, storeStatus } from "./db";
import { storageStatus } from "./storage";

const app = express();
// Render terminates HTTPS in front of us; trusting its proxy header makes req.protocol "https" (needed for download links).
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7),
    storage: storageStatus,
    // Which optional integrations have their keys set (yes/no only, never the values).
    integrations: {
      google: !!process.env.GOOGLE_CLIENT_ID,
      youtube: !!process.env.YOUTUBE_API_KEY,
      jamendo: !!process.env.JAMENDO_CLIENT_ID,
    },
    // Why YouTube last turned us away (a spent daily quota looks the same as a bad key from the app).
    youtube: youtubeStatus(),
    // Where the data lives and, when it is Google Drive, whether changes are being saved.
    dataStore: storeStatus(),
  }),
);

// Audio and cover files; express.static supports HTTP range requests, which seeking needs.
app.use("/media", express.static(path.join(__dirname, "..", "uploads")));

app.use("/auth", authRouter);
app.use("/songs", songsRouter);
app.use("/artists", artistsRouter);
app.use("/albums", albumsRouter);
app.use("/genres", genresRouter);
app.use("/movies", moviesRouter);
app.use("/moods", moodsRouter);
app.use("/playlists", playlistsRouter);
app.use("/users", usersRouter);
app.use("/admin/uploads", uploadsRouter);
app.use("/admin", adminRouter);
app.use("/app", appRouter);
app.use("/discover", discoverRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;

// Data has to be in place before the first request: with Google Drive as the store it is read in at startup.
// If it cannot be, stop -- serving an empty app would look like everyone's account had vanished.
ready()
  .then(() => {
    const server = app.listen(port, () => console.log(`API listening on :${port}`));
    failInterruptedJobs().catch((err) => console.error("could not clean up interrupted uploads:", err));
    // Keeps the video library stocked so the filters answer without spending the day's searches.
    startLibraryTopUp();

    // A restart or deploy sends SIGTERM: save anything not yet written before going.
    const stop = (signal: string) => {
      console.log(`${signal}: saving and shutting down`);
      server.close();
      closeStore()
        .catch((err) => console.error("could not save on shutdown:", err))
        .finally(() => process.exit(0));
    };
    process.once("SIGTERM", () => stop("SIGTERM"));
    process.once("SIGINT", () => stop("SIGINT"));
    // When started by another Node process (the verification script), it can ask for the same orderly stop.
    // Windows cannot deliver SIGTERM to a child -- it just kills it -- so this is how that path gets tested there.
    process.on("message", (m) => {
      if (m === "shutdown") stop("shutdown request");
    });
  })
  .catch((err) => {
    console.error("could not load the app's data:", err);
    process.exit(1);
  });
