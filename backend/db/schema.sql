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
