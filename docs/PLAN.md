# Music app — implementation plan

Written against what is actually in this repository. Nothing here is built unless it says **Done**.

## 1. What exists today

| Area | What we have |
|---|---|
| Mobile | React Native 0.87 CLI + TypeScript (`mobile/`), React Navigation, Zustand, TanStack Query, `react-native-track-player` (patched, see `mobile/patches/`), `react-native-webview` (YouTube) |
| Web | React + Vite (`web/`), HTML audio player, deployed on Cloudflare Pages (`music.deploymentportal.in`) |
| Admin | React + Vite (`admin/`), runs locally — **not deployed yet** |
| Backend | Node + Express + TypeScript (`backend/`) on Render free plan |
| Database | PostgreSQL on Aiven. Tables: users, artists, albums, genres, songs, playlists, playlist_songs, likes, recently_played |
| Storage | Cloudflare R2 bucket `musicapp-media`, public at `media.deploymentportal.in` |
| Auth | Email/password + JWT (15 min access / 30 day refresh), Google sign-in on the web |
| Discovery | Library search, Jamendo (Creative Commons) import, YouTube search (play-only, official player) |
| Downloads | Per-song `downloadable` flag set by the admin; short-lived signed download links (**Done**) |
| CI | `.github/workflows/android.yml` — builds, signs, launch-tests in an emulator, publishes (**Done**, now on-demand) |

Android: applicationId `com.musicapp`; version now comes from the release tag (**Done**). Release builds are signed with the React Native **debug** key that is committed in the repo — see risk R1.

## 2. Build pipeline (done) — how to ask for a build

The pipeline runs **only when requested**:

1. Tell Claude "build the APK" (optionally with a version), and a tag such as `v1.2.0` is pushed; **or**
2. GitHub → Actions → *Build Android APK* → *Run workflow* → enter `1.2.0`.

It then: validates the version (rejects duplicates and downgrades against the published `version.json`), builds with that `versionName`/`versionCode` (`major*10000 + minor*100 + patch`), verifies the signature, refuses to proceed if the signing certificate changed, launches the app in an emulator, and only if it stays alive publishes `music.apk` and `version.json` (real size, SHA-256, signer fingerprint) to the `latest` GitHub release. Takes roughly 20–25 minutes.

## 3. Mapping the requested features onto our data model

We do **not** add a second backend. We extend the existing one.

- **Movie = album.** We already have `albums` (title, artist, cover). Add: `description`, `release_year`, `language`, `music_director`, `status` (draft/published), `poster_url`. A separate `movies` table would duplicate it.
- **Songs**: add `singers`, `lyricist`, `music_director`, `track_number`, `language`, `description`, `status`, `description_source` (`manual` | `suggested`), `file_sha256`, `file_size`, `format`.
- **Moods**: new `moods` table and `song_moods(song_id, mood_id, is_primary, source)`.
- **Upload jobs**: new `upload_jobs` (status, counts, error details, created_by) and `upload_job_items` (one row per file; makes retries idempotent via file hash).
- Everything is additive (`ADD COLUMN IF NOT EXISTS` / new tables), applied through `backend/db/schema.sql`. Rollback = drop the new columns/tables; no existing data is touched.

## 4. Phases

| # | Phase | Notes |
|---|---|---|
| 1 | **Release pipeline** | Done |
| 2 | **Schema + metadata** (movies fields, moods, jobs) | **Done** — see `docs/MUSIC_ADMIN.md` |
| 3 | **ZIP upload (admin)** | **Done** (backend + admin screens, tested on the live API) |
| 4 | **Mood/description suggestions** | **Done** — rule-based, labelled "suggested" until confirmed |
| 5 | **Discovery** (movie search, mood filters, movie pages) | **Done on the website**; Android screens still to do |
| 6 | **Player upgrades** | Repeat one/all, queue screen, error recovery (RNTP already gives background + lock screen) |
| 7 | **Offline downloads** | Needs a native file library — see R3 |
| 8 | **Offline mode** | Network status + downloaded-only view |
| 9 | **In-app APK updater** | Needs a small native module — see R4 |
| 10 | **Admin deployment + review UI** | Review UI **done**; deploying the admin site is still your step |
| 11 | **Tests + docs** | Backend tests **done** (`npm test`); more to come with each phase |

### ZIP upload design (phase 3)
Stream the upload to a temp file (never into memory), read it with a streaming ZIP reader, and enforce: max compressed size, max extracted size, max file count, extension allow-list (mp3/m4a/aac/flac), rejection of absolute paths / `..` / symlinks / executables, magic-byte check of each audio file, and per-file size caps. Each accepted file becomes a *draft* song; nothing is public until the admin reviews and publishes. Processing runs as a background job with a status endpoint, and retrying skips files already processed (matched by SHA-256). Metadata is read from ID3 tags but the admin edits and confirms everything.

**Render free-plan limits:** 512 MB RAM, ephemeral disk, and the service sleeps. So: realistic ZIP limit ≈ 150–200 MB, temp files only, and a job interrupted by a restart is marked failed and can be retried safely.

### Mood suggestions (phase 4)
A transparent keyword/genre rule set produces a *suggested* description and moods from the movie name, title, genre and admin notes. They are clearly labelled "suggested", never claim to analyse the audio, never invent lyrics or singers, and the admin can edit or reject them. No AI service is required.

## 5. Risks and decisions I need from you

- **R1 — Signing key (important, decide before sharing the app widely).** The release APK is signed with a public debug key. Android only installs an update over an app signed with the *same* key, so whatever key is used now must be kept forever. Recommendation: create a private release keystore, store it in GitHub Secrets, and switch the pipeline to it **now**, while only your own phone has the app (it requires one reinstall). This needs `keytool` (a JDK) on a computer you control; I'll write the exact commands.
- **R2 — Copyright.** A ZIP upload doesn't prove the uploader may distribute the songs. The upload form will require the admin to confirm they hold the rights, and downloads stay off by default per song. I won't import music from piracy sites or YouTube.
- **R3 — Offline downloads need a native file library** (e.g. `react-native-blob-util`). Every native library so far needed fixes to launch on this React Native version. The emulator launch test catches launch crashes, but not real download behaviour, so this phase needs testing on your phone.
- **R4 — In-app updater needs a small native module** (read the installed versionCode, open the system installer through a FileProvider). Android will always show its own confirmation; silent installs aren't possible.
- **Hosting for the update files:** today `version.json` and the APK live in a GitHub release (free, public repo). Moving them to R2 needs an R2 write key stored as a GitHub secret by you. Not required to start.
- **Mandatory vs optional update:** the manifest has a `mandatory` flag; the app can nag, but cannot bypass Android's confirmation.

## 6. Not doing
Silent installs, audio analysis claims, importing songs from sites without a licence, putting any secret in the app.
