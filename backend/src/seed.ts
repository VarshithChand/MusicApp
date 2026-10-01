import bcrypt from "bcryptjs";
import { pool, query } from "./db";

// Demo data using freely streamable sample tracks (SoundHelix, royalty-free).
// Usage: npm run seed   (optionally ADMIN_EMAIL / ADMIN_PASSWORD env vars)
async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@musicapp.local";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin12345";
  await query(
    `INSERT INTO users (name, email, password_hash, is_admin) VALUES ('Admin', $1, $2, TRUE)
     ON CONFLICT (email) DO UPDATE SET is_admin = TRUE`,
    [adminEmail, await bcrypt.hash(adminPassword, 10)],
  );

  const [{ count }] = await query<{ count: number }>("SELECT COUNT(*)::int AS count FROM songs");
  if (count > 0) {
    console.log("Songs already exist, skipping catalog seed");
    return;
  }

  const genres: Record<string, number> = {};
  for (const name of ["Electronic", "Ambient", "Pop"]) {
    const [g] = await query("INSERT INTO genres (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", [name]);
    genres[name] = g.id;
  }

  const [artist] = await query("INSERT INTO artists (name) VALUES ('SoundHelix') RETURNING id");
  const [album] = await query("INSERT INTO albums (title, artist_id) VALUES ('Demo Album', $1) RETURNING id", [artist.id]);

  const base = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-";
  const tracks = [
    ["Demo Song 1", "Electronic", 372],
    ["Demo Song 2", "Ambient", 425],
    ["Demo Song 3", "Pop", 345],
    ["Demo Song 4", "Electronic", 305],
    ["Demo Song 5", "Ambient", 292],
  ] as const;

  for (const [i, [title, genre, duration]] of tracks.entries()) {
    await query(
      "INSERT INTO songs (title, artist_id, album_id, genre_id, audio_url, duration) VALUES ($1, $2, $3, $4, $5, $6)",
      [title, artist.id, album.id, genres[genre], `${base}${i + 1}.mp3`, duration],
    );
  }
  console.log(`Seeded demo catalog. Admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
