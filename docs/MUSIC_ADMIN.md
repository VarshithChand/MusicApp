# Movie soundtracks: admin guide

## Workflow

1. **Movies tab → Add a movie.** Name, main credit (an existing artist), language, year, music director, description, poster. New movies start as **Draft** (invisible to users).
2. **Uploads tab → Upload a soundtrack (ZIP).** Choose the movie, choose the ZIP, tick the rights confirmation, upload. A progress bar shows the upload; then the files are processed in the background and listed one by one as *Saved*, *Duplicate* or *Rejected* (with the reason).
3. **Movies tab → Review songs.** Edit each song (title, singers, music director, lyricist, language, description, moods, download permission), preview it, reorder with the arrows, then **Publish**.

Nothing is public until step 3's publish. Songs and movies can be unpublished again at any time.

## What a ZIP may contain

- MP3, M4A, AAC, FLAC only. Anything else is rejected with a reason (executables, text files, images…). Folders and OS junk (`__MACOSX`, `.DS_Store`, `Thumbs.db`) are skipped silently.
- Limits: ZIP up to **300 MB**, at most **100 entries**, **80 MB per file**, **500 MB** expanded in total.
- Each file's first bytes must match its extension, so a renamed text file is rejected.
- Unsafe names (`../x`, absolute paths, drive letters, backslashes) and symbolic links are rejected. Archive names are never used as file paths: every extracted file gets a random temporary name.
- Files are streamed to disk one at a time, never loaded into memory as a whole archive.
- Uploading the same ZIP again is safe: files already stored for that movie are matched by SHA-256 and skipped, so a failed or interrupted upload can simply be repeated.
- A server restart marks an in-flight job as **Failed** ("Interrupted…"); re-upload the ZIP.

Render's free plan has 512 MB RAM and sleeps when idle, so keep ZIPs to a few hundred MB at most.

## Descriptions and moods

- **Suggest description & moods** fills the fields from the title, movie, genre, language, singers and music director using a keyword list. It does **not** listen to the audio and never invents lyrics or singers.
- Suggested text is labelled **Suggested — not verified** until you tick "I have checked…" and save. Edit or clear anything you disagree with.
- Up to 6 moods per song; the first ticked is the main mood.

## Rights

A ZIP upload does not prove you may distribute the songs. The upload requires you to confirm you have the right, and **download permission is off by default** per song. Do not upload music you don't have permission to distribute.

## Database changes (all additive)

Applied by `backend/db/schema.sql` (safe to re-run): new columns on `albums` and `songs`, new tables `moods`, `song_moods`, `upload_jobs`, `upload_job_items`.
**Rollback:** `DROP TABLE upload_job_items, upload_jobs, song_moods, moods;` then drop the new `albums` and `songs` columns listed in the schema file. Existing rows and columns are untouched.

## API (admin, requires an admin login)

| Endpoint | Purpose |
|---|---|
| `POST /admin/albums` | create a movie (draft) |
| `PATCH /admin/albums/:id` | edit a movie / hide it (`status`) |
| `GET /admin/movies`, `GET /admin/movies/:id/songs` | movies and their songs in any state |
| `POST /admin/uploads` | upload a ZIP (`albumId`, `rightsConfirmed=true`, `zip`); returns `202 {jobId}` |
| `GET /admin/uploads`, `GET /admin/uploads/:id` | history and per-file results |
| `PATCH /admin/songs/:id` | edit any song detail, moods, status, download permission |
| `PUT /admin/movies/:id/order` | save track order |
| `GET /admin/songs/:id/suggest` | suggested description and moods |
| `POST /admin/movies/:id/publish` | publish the movie and its drafts |

Public (published content only): `GET /movies`, `GET /movies/:id`, `GET /moods`, `GET /songs?mood=&language=&q=`, and `GET /songs/search?q=` (also matches singers, music director, language and mood names).

## Tests

`cd backend && npm test` runs the unit tests (ZIP safety rules, hostile names, audio detection, mood suggestions).
