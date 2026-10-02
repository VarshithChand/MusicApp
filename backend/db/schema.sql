CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  profile_image TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artists (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  image_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS albums (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  artist_id  INT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  cover_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS genres (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS songs (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  artist_id  INT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  album_id   INT REFERENCES albums(id) ON DELETE SET NULL,
  genre_id   INT REFERENCES genres(id) ON DELETE SET NULL,
  audio_url  TEXT NOT NULL,
  cover_url  TEXT,
  duration   INT NOT NULL DEFAULT 0, -- seconds
  play_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playlists (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playlist_songs (
  playlist_id INT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  song_id     INT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, song_id)
);

-- "likes" and "favorites" are the same concept for the MVP: one table.
CREATE TABLE IF NOT EXISTS likes (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id    INT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);

CREATE TABLE IF NOT EXISTS recently_played (
  user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id   INT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album_id);
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
CREATE INDEX IF NOT EXISTS idx_recent_user ON recently_played(user_id, played_at DESC);

-- Songs imported from an outside catalogue (e.g. Jamendo): where they came from and under which licence.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS license_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_external ON songs(source, external_id) WHERE source IS NOT NULL;

-- "Continue with Google": the Google account id, so the same person always maps to the same user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- Only songs the admin has the right to distribute can be downloaded by users.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS downloadable BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- Movie soundtracks: richer metadata, moods, and ZIP upload jobs.
-- Additive only. Rollback: DROP the new tables and the new columns (nothing existing is changed).
-- A "movie" is an album: it already has a title, an artist and a cover.
-- ============================================================================

ALTER TABLE albums ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS release_year INT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS music_director TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS poster_url TEXT;
-- Existing albums stay visible; new ones start as drafts until the admin publishes them.
ALTER TABLE albums ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';

ALTER TABLE songs ADD COLUMN IF NOT EXISTS singers TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS lyricist TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS music_director TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS track_number INT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS description TEXT;
-- 'suggested' = produced by the keyword rules and not yet confirmed; 'manual' = written or confirmed by an admin.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS description_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE songs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE songs ADD COLUMN IF NOT EXISTS file_sha256 TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS format TEXT;

CREATE TABLE IF NOT EXISTS moods (
  id   SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

INSERT INTO moods (slug, name) VALUES
  ('melody', 'Melody'), ('romantic', 'Romantic'), ('sad', 'Sad'), ('happy', 'Happy'),
  ('energetic', 'Energetic'), ('dance', 'Dance'), ('party', 'Party'), ('motivational', 'Motivational'),
  ('devotional', 'Devotional'), ('classical', 'Classical'), ('folk', 'Folk'), ('instrumental', 'Instrumental'),
  ('relaxing', 'Relaxing'), ('friendship', 'Friendship'), ('travel', 'Travel'), ('workout', 'Workout')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS song_moods (
  song_id    INT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  mood_id    INT NOT NULL REFERENCES moods(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'suggested' until an admin confirms it, then 'manual'
  source     TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (song_id, mood_id)
);

CREATE TABLE IF NOT EXISTS upload_jobs (
  id               SERIAL PRIMARY KEY,
  album_id         INT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  created_by       INT REFERENCES users(id) ON DELETE SET NULL,
  filename         TEXT NOT NULL,
  -- processing -> review (songs are drafts, waiting for the admin) | failed
  status           TEXT NOT NULL DEFAULT 'processing',
  total_files      INT NOT NULL DEFAULT 0,
  processed_files  INT NOT NULL DEFAULT 0,
  error            TEXT,
  rights_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upload_job_items (
  id        SERIAL PRIMARY KEY,
  job_id    INT NOT NULL REFERENCES upload_jobs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  -- ok | rejected | duplicate
  status    TEXT NOT NULL,
  reason    TEXT,
  song_id   INT REFERENCES songs(id) ON DELETE SET NULL,
  sha256    TEXT,
  size      BIGINT
);

CREATE INDEX IF NOT EXISTS idx_songs_album_track ON songs(album_id, track_number);
CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
CREATE INDEX IF NOT EXISTS idx_songs_sha ON songs(file_sha256) WHERE file_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_albums_status ON albums(status);
CREATE INDEX IF NOT EXISTS idx_song_moods_mood ON song_moods(mood_id);
CREATE INDEX IF NOT EXISTS idx_job_items_job ON upload_job_items(job_id);
