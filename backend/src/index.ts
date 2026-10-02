import "dotenv/config";
import "express-async-errors"; // Express 4 does not forward rejected async handlers to the error middleware
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import { adminRouter } from "./routes/admin";
import { appRouter } from "./routes/app";
import { authRouter } from "./routes/auth";
import { albumsRouter, artistsRouter, genresRouter, moodsRouter, moviesRouter, songsRouter } from "./routes/catalog";
import { discoverRouter } from "./routes/discover";
import { playlistsRouter, usersRouter } from "./routes/playlists";
import { failInterruptedJobs, uploadsRouter } from "./routes/uploads";
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

failInterruptedJobs().catch((err) => console.error("could not clean up interrupted uploads:", err));

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
