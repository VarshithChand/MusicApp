import fs from "fs";
import path from "path";
import { pool, query } from "./db";
import { findMovieMatches } from "./movieName";

/**
 * Imports the Telugu reference workbook (db/reference/telugu-music.json): artists, soundtrack movies and genres.
 * Safe to run again: nothing is duplicated and nothing existing is overwritten.
 *  - Artists are matched by name (ignoring case); hints are only filled in where empty.
 *  - Movies are created as DRAFTS (invisible to users). A movie whose name matches an existing one is skipped.
 *  - Genres go into the catalogue genre list. No audio and no songs are created.
 * Usage: npm run import:reference
 */

interface Reference {
  source: string;
  language: string;
  artists: { name: string; voice: string | null; tags: string | null }[];
  movies: { title: string; year: number | null; exampleSingers: string | null; musicDirector: string | null; tags: string | null }[];
  genres: { name: string; description: string | null; related: string | null }[];
}

const SOURCE = "reference-workbook";
// Reference genres that are real musical genres (the others — Melody, Sad, Happy… — are search labels that already exist).
const CATALOGUE_GENRES = new Set(["Folk", "Devotional", "Classical", "Instrumental", "Rock", "Pop", "Electronic", "Orchestral / Epic"]);

async function artistId(name: string, extra?: { voice?: string | null; tags?: string | null }): Promise<{ id: number; created: boolean }> {
  const [found] = await query("SELECT id, voice, suggested_tags FROM artists WHERE lower(name) = lower($1) LIMIT 1", [name]);
  if (found) {
    // Only fill hints that are still empty; never overwrite what is there.
    if (extra && ((!found.voice && extra.voice) || (!found.suggested_tags && extra.tags))) {
      await query("UPDATE artists SET voice = COALESCE(voice, $2), suggested_tags = COALESCE(suggested_tags, $3) WHERE id = $1", [found.id, extra.voice ?? null, extra.tags ?? null]);
    }
    return { id: found.id, created: false };
  }
  const [created] = await query("INSERT INTO artists (name, voice, suggested_tags, source) VALUES ($1, $2, $3, $4) RETURNING id", [name, extra?.voice ?? null, extra?.tags ?? null, SOURCE]);
  return { id: created.id, created: true };
}

async function main() {
  const ref: Reference = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "db", "reference", "telugu-music.json"), "utf8"));
  const stats = { artistsCreated: 0, artistsExisting: 0, moviesCreated: 0, moviesSkipped: [] as string[], genresCreated: 0 };

  for (const a of ref.artists) {
    const r = await artistId(a.name, { voice: a.voice, tags: a.tags });
    if (r.created) stats.artistsCreated++;
    else stats.artistsExisting++;
  }

  const existing = await query<{ id: number; title: string }>("SELECT id, title FROM albums");
  for (const m of ref.movies) {
    const matches = findMovieMatches(m.title, existing);
    if (matches.length) {
      stats.moviesSkipped.push(`${m.title} (matches existing "${matches[0].title}")`);
      continue;
    }
    // A movie needs a credited artist: the music director, or "Various Artists".
    const credit = await artistId(m.musicDirector || "Various Artists");
    if (credit.created) stats.artistsCreated++;
    const [album] = await query(
      `INSERT INTO albums (title, artist_id, release_year, language, music_director, suggested_tags, example_singers, status, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8) RETURNING id`,
      [m.title, credit.id, m.year, ref.language, m.musicDirector, m.tags, m.exampleSingers, SOURCE],
    );
    existing.push({ id: album.id, title: m.title });
    stats.moviesCreated++;
  }

  for (const g of ref.genres) {
    if (!CATALOGUE_GENRES.has(g.name)) continue;
    const [found] = await query("SELECT id FROM genres WHERE lower(name) = lower($1)", [g.name]);
    if (!found) {
      await query("INSERT INTO genres (name) VALUES ($1)", [g.name]);
      stats.genresCreated++;
    }
  }

  console.log(JSON.stringify(stats, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
