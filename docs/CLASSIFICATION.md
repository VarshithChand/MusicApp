# Song classification and smart search

## What is built, and what it is not

- Every uploaded song is **analysed from its actual audio** (tempo, loudness, brightness, beat strength) and, as weaker evidence, its title and movie. The result is a set of **suggested labels with confidence scores**.
- The classifier is a **transparent set of hand-written rules (`heuristic-v1`), not a trained machine-learning model.** No labelled dataset exists in this project, so no model has been trained and **no accuracy is claimed**. Treat every suggestion as a starting point.
- An admin must approve labels. **Search only uses approved labels.** Re-running the classifier never changes approved labels.
- A pluggable **external classifier service** is supported (see below) so a real pretrained or custom model can replace the rules without changing the app.

## Labels: three separate kinds

| Kind | Meaning | Labels |
|---|---|---|
| style | energy / feel | Melody, DJ / Remix, Mass, High Energy, Dance |
| mood | emotion | Sad, Happy, Romantic, Love, Party, Motivational, Relaxing, Friendship, Travel, Workout |
| genre | tradition | Folk, Devotional, Classical, Instrumental, Rock, Pop, Electronic, Orchestral / Epic |

A song can have several labels of any kind. (Stored in the `moods` table with a `kind` column; `songs.genre_id` still holds the catalogue genre separately.)

## Data model (additive migrations in `backend/db/schema.sql`)

- `moods.kind`, new labels `dj-remix`, `mass`, `love`.
- `song_moods` = the song's **approved** labels (`source = 'manual'`) plus `confidence`. Rows with `source = 'suggested'` are not searchable.
- `song_classifications` (one row per song): `labels` (predictions with confidence and evidence), `features` (what was measured), `method`, `model_version`, `review_status` (`pending | needs_review | approved | rejected`), `audio_sha256` (cache key), `error`.

Rollback: `DROP TABLE song_classifications; ALTER TABLE song_moods DROP COLUMN confidence; ALTER TABLE moods DROP COLUMN kind; DELETE FROM moods WHERE slug IN ('dj-remix','mass','love');`

## How a song is classified

1. **Cache:** the same audio (SHA-256) with the same model version reuses its earlier result.
2. **External service** (only if `CLASSIFIER_URL` is set): `POST {CLASSIFIER_URL}/classify` with `{audioUrl, title, movie, language, singers}` and optional header `X-API-Key: $CLASSIFIER_API_KEY`. It must answer `{"model": "name", "version": "1", "labels": [{"slug": "melody", "confidence": 0.8}]}`. Unknown slugs and scores outside 0–1 are dropped. 25 s timeout.
3. **Local audio analysis:** ffmpeg (from `@ffmpeg-installer/ffmpeg`, no system install) decodes up to 75 s (skipping a 30 s intro on long songs) to 11 kHz mono; `src/classifier/features.ts` measures loudness (RMS dB) and crest factor, spectral centroid / brightness, bass share, onset density (hits per second) and **tempo** (autocorrelation of the onset curve, 60–200 BPM) with a **beat strength** that is scaled down when the onsets are not distinct (so a sustained tone is not mistaken for a drum beat).
4. **Rules (`src/classifier/rules.ts`):** energy score + tempo + beat strength → style labels (Mass, High Energy, DJ / Remix, Dance, Melody). Mood from audio alone is weak, so it is capped below the review line. Title / movie / genre words add weaker evidence. **The audio has the final say on style labels:** a title saying "Melody" cannot make a loud drum track a melody.
5. **Fallback:** if audio cannot be decoded, the title and movie are used and the song is marked **needs review**.
6. **Confidence:** labels below 0.35 are not suggested; if the best label is below 0.55, or the audio is near-silent, the song is flagged **needs review** instead of being trusted.

Classification runs while the ZIP is processed (one song at a time), failures never fail the upload, and the admin sees progress per file.

## Admin review

*Movies → Review songs* shows, per song: status, method and model version, measured tempo / loudness / hits per second / beat strength, each suggested label with a confidence bar, and buttons to **use**, **approve**, **reject**, **re-run**, or tick labels by hand. For a movie: **approve all confident suggestions** (skips songs needing review), **approve everything** (asks first), **re-run for all songs**.

## Search

`GET /songs/search?q=…`, `GET /songs?labels=a,b&language=…&q=…&limit=…&offset=…`

- A search made only of label, language and filler words is a **category search**: `Melody`, `DJ Songs`, `Remix`, `Mass Songs`, `High Energy`, `Sad Songs`, `Happy`, `Melody + Romantic`, `DJ Telugu`, `Mass Telugu`. Only songs with that **approved** label match; a title that merely contains the word does not.
- Anything else (e.g. the movie *Love Story*) is a **text search** over title, singers, artist, movie, music director, genre and the exact name of an approved label, ranked with label matches first.
- **Combining filters uses AND** everywhere: every selected label and language must match. Inside one group of synonyms it is OR (`Mass Songs` and `High Energy` are the same group).
- Results are paginated (`limit` ≤ 100, `offset`). `GET /moods` counts only approved labels on published songs. The response of `/songs/search` includes `interpretedAs` when a search was understood as categories.

## Movie name detection (ZIP upload)

Priority: a name typed by the admin, else the ZIP file name. `Pushpa_2_Songs.zip` → *Pushpa 2*, `RRR.zip` → *RRR*, `Arjun_Reddy_OST.zip` → *Arjun Reddy*, `The Paradise (2026) - 320 Kbps.zip` → *The Paradise* + year 2026. Underscores, hyphens and dots become spaces; only file-description words are removed, and only from the **end** (songs, OST, jukebox, soundtrack, bitrate tags, a trailing year). Vague names (`Movie_Songs_2025.zip`) are refused until the admin confirms or types a name. Before a movie is created the server checks for the same or a nearly identical existing movie (sequels like *Pushpa* / *Pushpa 2* are different) and asks the admin to use the existing one or confirm a separate movie. New movies are always **drafts**.

## Runtime requirements and setup

- No new service or paid API. `@ffmpeg-installer/ffmpeg` provides ffmpeg for Windows, Linux and macOS (installed with `npm install --include=dev`).
- Analysis is CPU work (about a second per song on a normal server). Render's free plan is shared and small, so ZIPs are processed one song at a time.
- Optional: `CLASSIFIER_URL`, `CLASSIFIER_API_KEY`, `FFMPEG_PATH` (use a system ffmpeg instead).

## Training a real model later (optional, not run)

`ml/` contains a script to train and evaluate a classifier on **properly licensed, labelled** audio, with a train / validation / test split, per-class precision, recall and F1, and a confusion matrix. It has **not** been run because there is no dataset here. Do not train on unlicensed music or on file names as labels. Serve the trained model behind the `CLASSIFIER_URL` contract above.

## Tests

`cd backend && npm test`: movie-name rules, duplicate detection, label parsing, the SQL filter (AND logic, no title matching for category searches, pagination parameters), tempo estimation on synthetic drum tracks, energy and style rules, low confidence, the metadata fallback when the classifier service or ffmpeg fails, approving suggestions, "re-running never changes approved labels", "admin edits override predictions", and a real file decoded through ffmpeg.

Measured accuracy against a labelled evaluation set is **not available** — there is none yet.

## Reference data import (Telugu workbook)

`backend/db/reference/telugu-music.json` was converted from `telugu_music_artists_albums_genres.xlsx` (49 artists, 36 movies, 20 genres). `npm run import:reference` (in `backend/`) loads it and is safe to repeat:

- Artists are matched by name (ignoring case); the workbook's voice / tag hints are saved only where empty.
- The 36 movies become **draft** albums (Telugu, year, music director, suggested tags, example singers). They stay hidden from users until an admin uploads songs and publishes. Movies that match an existing one are skipped.
- Five missing genres were added to the catalogue. No songs or audio are created, and the tags are hints, not approved labels.

Rollback: see the comment at the end of `backend/db/schema.sql`.
