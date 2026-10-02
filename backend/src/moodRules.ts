/**
 * Suggests a short description and moods for a song from the metadata we actually have (title, movie, genre,
 * language, singers). This does NOT analyse the audio, and it never invents lyrics, singers or facts: every
 * suggestion is shown to the admin as "suggested" and must be confirmed or edited before it counts as verified.
 */

export interface SongInfo {
  title: string;
  movie?: string | null;
  genre?: string | null;
  language?: string | null;
  singers?: string | null;
  musicDirector?: string | null;
  releaseYear?: number | null;
}

export interface Suggestion {
  description: string;
  moods: { slug: string; primary: boolean }[];
}

// Words that hint at a mood when they appear in the title, movie name or genre.
const KEYWORDS: Record<string, string[]> = {
  romantic: ["love", "prema", "premam", "ishq", "pyaar", "pyar", "romance", "romantic", "heart", "kiss", "valentine", "sweetheart"],
  sad: ["sad", "pain", "tears", "cry", "goodbye", "alone", "lonely", "miss", "viraham", "broken", "sorrow"],
  happy: ["happy", "joy", "smile", "celebration", "celebrate", "cheer", "sunshine", "laugh"],
  energetic: ["mass", "power", "fire", "thunder", "rise", "storm", "lion", "sher", "roar", "blast", "mass"],
  dance: ["dance", "dhol", "beat", "naatu", "disco", "groove", "item", "thumka"],
  party: ["party", "club", "night", "dj", "bash"],
  motivational: ["rise", "win", "victory", "believe", "never give up", "champion", "dream", "warrior", "hero"],
  devotional: ["bhakti", "devotional", "god", "lord", "ram", "krishna", "shiva", "ganesha", "hanuman", "amma", "devi", "aarti", "bhajan", "stotram"],
  classical: ["raga", "raag", "classical", "carnatic", "hindustani", "sangeet"],
  folk: ["folk", "janapada", "village", "janapadam", "lavani"],
  instrumental: ["instrumental", "theme", "bgm", "background score", "karaoke"],
  relaxing: ["chill", "lofi", "lullaby", "peace", "calm", "relax", "serene", "ambient"],
  friendship: ["friend", "dosti", "nestham", "friendship", "buddy", "yaar"],
  travel: ["journey", "road", "safar", "travel", "trip", "ride", "highway"],
  workout: ["gym", "workout", "run", "training", "fitness"],
  melody: ["melody", "melodious", "ragam", "tune"],
};

// If the keywords found nothing, a genre can still hint at a mood.
const GENRE_HINTS: Record<string, string> = {
  ambient: "relaxing",
  electronic: "dance",
  pop: "happy",
  classical: "classical",
  folk: "folk",
  devotional: "devotional",
  instrumental: "instrumental",
  rock: "energetic",
  hiphop: "energetic",
  "hip hop": "energetic",
  jazz: "relaxing",
  lofi: "relaxing",
};

const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");

export function suggestMoods(info: SongInfo): { slug: string; primary: boolean }[] {
  const haystack = ` ${words([info.title, info.movie, info.genre].filter(Boolean).join(" "))} `;
  const scores = new Map<string, number>();

  for (const [slug, list] of Object.entries(KEYWORDS)) {
    for (const keyword of list) {
      if (haystack.includes(` ${keyword} `) || (keyword.length > 4 && haystack.includes(keyword))) {
        scores.set(slug, (scores.get(slug) ?? 0) + 1);
      }
    }
  }

  const genreKey = info.genre?.toLowerCase().trim();
  if (scores.size === 0 && genreKey && GENRE_HINTS[genreKey]) scores.set(GENRE_HINTS[genreKey], 1);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return ranked.map(([slug], i) => ({ slug, primary: i === 0 }));
}

/** A plain sentence built only from facts the admin or the file's tags provided. */
export function suggestDescription(info: SongInfo): string {
  const parts: string[] = [`"${info.title}"`];
  const lang = info.language ? `${info.language} ` : "";
  if (info.movie) {
    const year = info.releaseYear ? ` (${info.releaseYear})` : "";
    parts.push(`is a ${lang}song from the film ${info.movie}${year}`);
  } else {
    parts.push(`is a ${lang}song`);
  }
  let text = parts.join(" ");
  if (info.singers) text += `, sung by ${info.singers}`;
  if (info.musicDirector) text += `, with music by ${info.musicDirector}`;
  return `${text}.`;
}

export function suggest(info: SongInfo): Suggestion {
  return { description: suggestDescription(info), moods: suggestMoods(info) };
}
