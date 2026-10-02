/**
 * Suggests a movie name from a ZIP file name, and finds existing movies it could duplicate.
 * Pure functions (no database) so they can be tested directly.
 *
 * The ZIP name identifies the movie or soundtrack. It does NOT name the individual songs.
 */

export interface MovieNameSuggestion {
  /** The cleaned-up name. May be empty if nothing usable is left. */
  name: string;
  /** True when the name is too vague to trust: the admin must confirm or type the real name. */
  ambiguous: boolean;
  /** A year found in the file name, e.g. "(2026)". Offered as the release year, never kept in the name. */
  releaseYear: number | null;
  reason: string | null;
}

// Words that describe the file rather than the movie. They are only removed from the END of the name,
// so a title like "Songs of Paradise" or "Original Sin" keeps its meaningful words.
const TRAILING_NOISE = new Set([
  "songs", "song", "ost", "jukebox", "soundtrack", "soundtracks", "mp3", "mp3s", "album", "audio", "full",
  "complete", "official", "original", "music", "download", "zip", "flac", "aac",
]);

// Words that, on their own, say nothing about which movie this is.
const GENERIC = new Set([
  "movie", "movies", "film", "films", "songs", "song", "music", "album", "audio", "new", "latest", "best", "hit", "hits",
  "telugu", "hindi", "tamil", "kannada", "malayalam", "english", "mp3", "unknown", "untitled", "download", "zip",
  "soundtrack", "soundtracks", "ost", "jukebox", "file", "files", "folder", "my", "all", "full", "complete",
]);

const isYear = (token: string) => /^(19|20)\d{2}$/.test(token);

function titleCaseIfAllLower(name: string): string {
  if (name !== name.toLowerCase() || !/\p{L}/u.test(name)) return name;
  return name.replace(/\p{L}[\p{L}\p{N}']*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

export function suggestMovieName(zipFileName: string): MovieNameSuggestion {
  // Remove the extension and any folder part.
  const base = zipFileName.split(/[\\/]/).pop() ?? zipFileName;
  const withoutExt = base.replace(/\.zip$/i, "");

  // Underscores, hyphens, dots and brackets all become spaces.
  let tokens = withoutExt
    .replace(/[_\-.()[\]{}]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let releaseYear: number | null = null;

  // Strip trailing file-description words and bitrate tags: "... 320 Kbps", "... 128kbps", "... OST", "... Songs".
  const stripTail = () => {
    let changed = true;
    while (changed && tokens.length > 1) {
      changed = false;
      const last = tokens[tokens.length - 1].toLowerCase();
      const prev = tokens[tokens.length - 2]?.toLowerCase();
      if (/^\d{2,3}kbps$/.test(last)) {
        tokens.pop();
        changed = true;
      } else if (last === "kbps" && prev && /^\d{2,3}$/.test(prev) && tokens.length > 2) {
        tokens.splice(-2, 2);
        changed = true;
      } else if (TRAILING_NOISE.has(last)) {
        tokens.pop();
        changed = true;
      } else if (isYear(last) && tokens.length > 1) {
        releaseYear = Number(last);
        tokens.pop();
        changed = true;
      }
    }
  };
  stripTail();

  const name = titleCaseIfAllLower(tokens.join(" ").trim());
  const lowerTokens = tokens.map((t) => t.toLowerCase());

  if (!name) return { name: "", ambiguous: true, releaseYear, reason: "The file name has no usable movie name." };
  if (lowerTokens.every((t) => GENERIC.has(t) || /^\d+$/.test(t))) {
    return { name, ambiguous: true, releaseYear, reason: "The file name looks generic, so it may not be the movie's name." };
  }
  if (name.length < 2) return { name, ambiguous: true, releaseYear, reason: "The name is very short." };
  return { name, ambiguous: false, releaseYear, reason: null };
}

/** A comparison key: ignores case, punctuation, a leading "The" and "&" vs "and". */
export function movieKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/^the\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

export interface ExistingMovie {
  id: number;
  title: string;
}

export interface MovieMatch extends ExistingMovie {
  /** "same" = the same name apart from case and punctuation; "similar" = one character different. */
  kind: "same" | "similar";
}

/** Existing movies the new name could duplicate. Different numbers ("Pushpa" vs "Pushpa 2") are NOT matches. */
export function findMovieMatches(name: string, existing: ExistingMovie[]): MovieMatch[] {
  const key = movieKey(name);
  if (!key) return [];
  const matches: MovieMatch[] = [];
  for (const movie of existing) {
    const other = movieKey(movie.title);
    if (other === key) matches.push({ ...movie, kind: "same" });
    // "Similar" = one character apart AND the same numbers, so sequels like "Pushpa" / "Pushpa 2" never match.
    else if (key.length >= 6 && other.length >= 6 && editDistance(key, other) === 1 && key.replace(/\D/g, "") === other.replace(/\D/g, ""))
      matches.push({ ...movie, kind: "similar" });
  }
  return matches.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "same" ? -1 : 1));
}

/**
 * Which name to use for a new movie, in priority order:
 *  1. a name the admin typed;
 *  2. the name taken from the ZIP file name;
 * and when that name is ambiguous the admin has to confirm it (confirmed = true) before a movie is created.
 */
export function chooseMovieName(
  manualName: string | undefined,
  zipFileName: string,
  confirmed: boolean,
): { ok: true; name: string; source: "manual" | "filename"; releaseYear: number | null } | { ok: false; suggestion: MovieNameSuggestion } {
  const suggestion = suggestMovieName(zipFileName);
  const manual = manualName?.replace(/\s+/g, " ").trim();
  if (manual) return { ok: true, name: manual, source: "manual", releaseYear: suggestion.releaseYear };
  if (!suggestion.name || (suggestion.ambiguous && !confirmed)) return { ok: false, suggestion };
  return { ok: true, name: suggestion.name, source: "filename", releaseYear: suggestion.releaseYear };
}
