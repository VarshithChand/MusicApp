/**
 * The app's label vocabulary. Three kinds are kept separate on purpose:
 *   style — energy / feel of the track (Melody, DJ / Remix, Mass, Dance, High Energy)
 *   mood  — how it feels emotionally (Sad, Happy, Romantic, ...)
 *   genre — musical tradition (Classical, Folk, Devotional, Instrumental)
 * A song can carry several labels, of any kind. The database table `moods` stores them (with a `kind` column).
 */

export type LabelKind = "style" | "mood" | "genre";

export interface LabelDef {
  slug: string;
  name: string;
  kind: LabelKind;
}

export const LABELS: LabelDef[] = [
  { slug: "melody", name: "Melody", kind: "style" },
  { slug: "dj-remix", name: "DJ / Remix", kind: "style" },
  { slug: "mass", name: "Mass", kind: "style" },
  { slug: "energetic", name: "High Energy", kind: "style" },
  { slug: "dance", name: "Dance", kind: "style" },
  { slug: "sad", name: "Sad", kind: "mood" },
  { slug: "happy", name: "Happy", kind: "mood" },
  { slug: "romantic", name: "Romantic", kind: "mood" },
  { slug: "love", name: "Love", kind: "mood" },
  { slug: "party", name: "Party", kind: "mood" },
  { slug: "motivational", name: "Motivational", kind: "mood" },
  { slug: "relaxing", name: "Relaxing", kind: "mood" },
  { slug: "friendship", name: "Friendship", kind: "mood" },
  { slug: "travel", name: "Travel", kind: "mood" },
  { slug: "workout", name: "Workout", kind: "mood" },
  { slug: "folk", name: "Folk", kind: "genre" },
  { slug: "devotional", name: "Devotional", kind: "genre" },
  { slug: "classical", name: "Classical", kind: "genre" },
  { slug: "instrumental", name: "Instrumental", kind: "genre" },
  { slug: "rock", name: "Rock", kind: "genre" },
  { slug: "pop", name: "Pop", kind: "genre" },
  { slug: "electronic", name: "Electronic", kind: "genre" },
  { slug: "orchestral", name: "Orchestral / Epic", kind: "genre" },
];

export const LABEL_SLUGS = new Set(LABELS.map((l) => l.slug));

/**
 * What a user may type to mean a label. Each phrase maps to a GROUP of slugs: the song matches if it has ANY label in the
 * group ("Mass Songs" and "High Energy" are the same group). Different groups in one search are combined with AND.
 */
const ALIAS_GROUPS: Record<string, string[]> = {
  melody: ["melody"],
  melodies: ["melody"],
  melodic: ["melody"],
  dj: ["dj-remix"],
  djs: ["dj-remix"],
  remix: ["dj-remix"],
  remixes: ["dj-remix"],
  "dj remix": ["dj-remix"],
  mass: ["mass", "energetic"],
  "high energy": ["mass", "energetic"],
  energetic: ["mass", "energetic"],
  sad: ["sad"],
  happy: ["happy"],
  romantic: ["romantic"],
  romance: ["romantic"],
  love: ["love"],
  dance: ["dance"],
  party: ["party"],
  folk: ["folk"],
  devotional: ["devotional"],
  bhakti: ["devotional"],
  classical: ["classical"],
  instrumental: ["instrumental"],
  relaxing: ["relaxing"],
  motivational: ["motivational"],
  friendship: ["friendship"],
  travel: ["travel"],
  workout: ["workout"],
  rock: ["rock"],
  pop: ["pop"],
  electronic: ["electronic"],
  orchestral: ["orchestral"],
  orchestra: ["orchestral"],
};

const NOISE = new Set(["songs", "song", "music", "tracks", "track", "hits"]);

export const LANGUAGE_WORDS = new Set(["telugu", "hindi", "tamil", "kannada", "malayalam", "english", "marathi", "bengali", "punjabi"]);

export interface ParsedQuery {
  /** Label groups. A song needs one label from EVERY group (AND between groups, OR inside a group). */
  groups: string[][];
  languages: string[];
  /** Free text. Empty for a pure label/language search such as "Sad Songs" or "Mass Telugu". */
  text: string;
}

const sameGroup = (a: string[], b: string[]) => a.length === b.length && a.every((s) => b.includes(s));

/**
 * Understands searches like "Melody", "DJ Songs", "Mass Songs", "Sad + Melody", "Mass Telugu".
 * Only when the WHOLE search is made of label, language and filler words is it treated as a category search.
 * Anything else — like the movie name "Love Story" — stays a plain text search, so a title is never mistaken for a label.
 */
export function parseSearchQuery(raw: string): ParsedQuery {
  const tokens = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  const groups: string[][] = [];
  const languages: string[] = [];
  let hasOther = false;

  for (let i = 0; i < tokens.length; i++) {
    const two = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : "";
    if (two && ALIAS_GROUPS[two]) {
      if (!groups.some((g) => sameGroup(g, ALIAS_GROUPS[two]))) groups.push(ALIAS_GROUPS[two]);
      i++;
    } else if (ALIAS_GROUPS[tokens[i]]) {
      if (!groups.some((g) => sameGroup(g, ALIAS_GROUPS[tokens[i]]))) groups.push(ALIAS_GROUPS[tokens[i]]);
    } else if (LANGUAGE_WORDS.has(tokens[i])) {
      if (!languages.includes(tokens[i])) languages.push(tokens[i]);
    } else if (!NOISE.has(tokens[i])) {
      hasOther = true;
    }
  }

  const text = raw.trim();
  if (hasOther || (!groups.length && !languages.length)) return { groups: [], languages: [], text };
  return { groups, languages, text: "" };
}

/** Converts label slugs chosen in the UI (?labels=melody,romantic) into AND-combined groups. */
export function groupsFromSlugs(slugs: string[]): string[][] {
  const groups: string[][] = [];
  for (const slug of slugs) {
    const s = slug.trim().toLowerCase();
    if (!LABEL_SLUGS.has(s)) continue;
    const g = s === "mass" || s === "energetic" ? ["mass", "energetic"] : [s];
    if (!groups.some((x) => sameGroup(x, g))) groups.push(g);
  }
  return groups;
}
