# Music app — project overview

One page that answers: what the app is, what it is used for, what it can do, what we built it with, which phase we are in, and what options we have next. Detailed designs are in [PLAN.md](PLAN.md), [MUSIC_ADMIN.md](MUSIC_ADMIN.md) and [CLASSIFICATION.md](CLASSIFICATION.md). Status is as of 2026-10-05.

## 1. What the app is and who uses it

A free-to-run music platform with three parts:

| Part | Who uses it | What for |
|---|---|---|
| **Android app** (`mobile/`) | Listeners | Play music, search, playlists, likes, download allowed songs, watch trending videos |
| **Website** (`web/`, music.deploymentportal.in) | Listeners | The same, in a browser, plus a button to download the Android app |
| **Admin panel** (`admin/`) | The owner | Upload movie soundtrack ZIPs, review and publish, approve labels, mark songs downloadable |

Everything behind them is one backend and one database, so the app and website always show the same library.

## 2. Features

### Listening (app and website)
- Play, pause, next, previous, skip 5 seconds, seek; background play and lock-screen controls on Android.
- Loading spinners while a song loads.
- Library search by song, artist, album, movie, singer or music director.
- Playlists, liked songs, recently played, popular songs, artist and album pages.
- Sign in with email and password, or with Google (website).
- **Trending and popular Telugu videos** on Home (website and app), played in YouTube's own embedded player.
- Free music discovery: search the Jamendo (Creative Commons) catalogue and add songs to the library.
- Download a song for offline use **only when the admin has marked it downloadable**.
- Download the Android app from the website (always the latest published APK).

### Movies, labels and smart search (website; Android screens not built yet)
- Movie soundtrack pages with poster, year, music director and song list.
- Labels in three kinds: **style** (Melody, DJ / Remix, Mass, High Energy, Dance), **mood** (Sad, Happy, Romantic, Love, Party, Motivational, Relaxing, Friendship, Travel, Workout) and **genre** (Folk, Devotional, Classical, Instrumental, Rock, Pop, Electronic, Orchestral / Epic).
- Searches such as "Mass Telugu" or "Melody + Romantic" use **approved** labels only; every selected label must match (AND).

### Admin
- Upload a movie ZIP. The movie name is detected from what the admin types or the ZIP file name; duplicates and vague names are caught before anything is created.
- Songs are created as **drafts**; nothing is public until the admin reviews and publishes.
- Each song is analysed from its audio (tempo, loudness, brightness, beat strength) and gets **suggested** labels with confidence scores. The admin approves, rejects, edits or re-runs.
- Rights confirmation is required for every ZIP upload.

### Reference data
- The Telugu workbook is imported: 49 artists, 36 movies (as drafts) and the genre list. No songs or audio come from it.

## 3. Technology stack

| Layer | Technology | Hosting / cost |
|---|---|---|
| Android app | React Native 0.87 (CLI) + TypeScript, React Navigation, Zustand, TanStack Query, react-native-track-player (patched), react-native-webview | Free; APK shared directly |
| Website and admin | React + Vite + TypeScript | Cloudflare Pages, free |
| Backend | Node + Express + TypeScript, zod, JWT, bcryptjs, multer, yauzl, music-metadata, ffmpeg (bundled) | Render free plan (sleeps when idle) |
| Database | PostgreSQL | Aiven free plan |
| File storage | Cloudflare R2 (S3 API), public at media.deploymentportal.in | Free tier |
| Sign-in | Email/password + JWT; Google sign-in | Free |
| Discovery | Jamendo API (Creative Commons), YouTube Data API (search and trending) | Free quota |
| Build and release | GitHub Actions: build, sign, emulator launch test, publish APK and `version.json` | Free; runs only on request |
| Tests | Node test runner (49 backend tests) | n/a |

## 4. Phases and where we are

| # | Phase | Status |
|---|---|---|
| 1 | Release pipeline (on-demand APK build, signed, smoke-tested, published) | Done |
| 2 | Database schema for movies, labels, upload jobs | Done |
| 3 | Admin ZIP upload with movie-name detection | Done |
| 4 | Label suggestions and classification with admin review | Done (rule-based, not a trained model) |
| 5 | Discovery: movies, label filters, trending | Done on the website; **trending done on Android; movies and labels screens not yet** |
| 6 | Player upgrades (repeat, queue screen, error recovery) | Not started |
| 7 | Offline downloads in the app | Not started (needs a native file library; test on a phone) |
| 8 | Offline mode (network status, downloaded-only view) | Not started |
| 9 | In-app APK updater | Not started (needs a small native module) |
| 10 | Admin site deployment | Review screen done; **deploying the admin site is still open** |
| 11 | Tests and docs | Backend tests and docs done; grows with each phase |

**Current position:** phases 1–4 are finished and live; phase 5 is partly done. Latest published APK: v0.2.3, built from the current code.

## 5. Options for what to do next

| Option | What it gives | Effort / catch |
|---|---|---|
| A. Android movies and labels screens (finish phase 5) | App matches the website | Medium; no new native code. **Recommended next.** |
| B. Deploy the admin site to Cloudflare Pages | Upload from any device, not just your laptop | Small; one setup step on your side |
| C. Private release signing key | Safe future updates for other people | Small; best done before sharing the app widely (risk R1 in PLAN.md) |
| D. Offline downloads and offline mode (phases 7–8) | Listen without internet | Large; native library, must be tested on a phone |
| E. In-app APK updater (phase 9) | Update from inside the app | Medium; Android still shows its own install prompt |
| F. Player upgrades (phase 6) | Repeat, queue, better error recovery | Medium |
| G. Train a real classifier (`ml/`) | Better label suggestions | Needs licensed, labelled audio we do not have |
| H. App locker (separate app) | Lock other apps with a fingerprint | New product; see section 7 |

## 6. Limits and rules we keep

- YouTube is played only in its own visible embedded player. We do not download it, extract its audio or hide the player.
- Downloads exist only for songs the admin marks downloadable. We do not import music from sites without a licence.
- Render's free plan sleeps when idle, so the first request after a pause can take about a minute, and ZIP uploads should stay under about 150–200 MB.
- Label suggestions are rules over audio measurements. They are starting points, and no accuracy figure is claimed.
- Secrets live in Render and GitHub settings, never in the app or the repository.

## 7. Idea under discussion: app locker

A separate Android app that locks chosen apps behind a fingerprint, with a PIN fallback. It would detect the opened app with an Accessibility Service, cover it with a lock screen, and unlock through Android's biometric prompt. It needs Accessibility and "display over other apps" permissions, and some phone brands need extra battery settings. It would be a new project in its own folder, built with the same free pipeline. Not started; waiting for your decision.
