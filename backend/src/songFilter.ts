import { ParsedQuery } from "./labels";

/** "%text%" for ILIKE, with the wildcard characters in the text itself escaped. */
export const likePattern = (text: string) => `%${text.replace(/[%_\\]/g, "\\$&")}%`;

export interface SongFilter {
  /** SQL conditions to AND together (parameters are numbered from `firstParam`). */
  conditions: string[];
  params: unknown[];
  /** ORDER BY expression: best label match first, then popularity. */
  orderBy: string;
}

/** An APPROVED label (source = 'manual'). Suggestions and predictions never count for search. */
const APPROVED = "sm.source = 'manual'";

/**
 * Turns a parsed search into SQL conditions. Pure, so the rules can be tested without a database:
 *  - label groups: the song must have an approved label from EVERY group (AND), any label inside a group (OR);
 *  - languages: the song's (or its movie's) language must match;
 *  - free text: title, singers, artist, movie, or the NAME of an approved label — never loose keyword guesses.
 * A pure category search ("Melody") has NO text condition, so a title containing the word can't sneak into the results.
 */
export function buildSongFilter(parsed: ParsedQuery, firstParam = 1): SongFilter {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const next = (value: unknown) => {
    params.push(value);
    return `$${firstParam + params.length - 1}`;
  };

  const groupRefs: string[] = [];
  for (const group of parsed.groups) {
    const ref = next(group);
    groupRefs.push(ref);
    conditions.push(
      `EXISTS (SELECT 1 FROM song_moods sm JOIN moods m ON m.id = sm.mood_id WHERE sm.song_id = s.id AND ${APPROVED} AND m.slug = ANY(${ref}))`,
    );
  }

  if (parsed.languages.length) {
    conditions.push(`lower(COALESCE(s.language, al.language, '')) = ANY(${next(parsed.languages)})`);
  }

  let orderBy = "s.play_count DESC, s.id DESC";
  if (parsed.text) {
    const like = next(likePattern(parsed.text));
    const exact = next(parsed.text.toLowerCase());
    conditions.push(
      `(s.title ILIKE ${like} OR s.singers ILIKE ${like} OR ar.name ILIKE ${like} OR al.title ILIKE ${like} OR s.music_director ILIKE ${like} OR g.name ILIKE ${like}
        OR EXISTS (SELECT 1 FROM song_moods sm JOIN moods m ON m.id = sm.mood_id WHERE sm.song_id = s.id AND ${APPROVED} AND lower(m.name) = ${exact}))`,
    );
    // An exact approved label match ranks above a title that merely contains the words.
    orderBy = `(CASE WHEN EXISTS (SELECT 1 FROM song_moods sm JOIN moods m ON m.id = sm.mood_id WHERE sm.song_id = s.id AND ${APPROVED} AND lower(m.name) = ${exact}) THEN 0 ELSE 1 END), ${orderBy}`;
  } else if (groupRefs.length) {
    // Label search: strongest approved confidence for the first group first.
    orderBy = `(SELECT MAX(COALESCE(sm.confidence, 1)) FROM song_moods sm JOIN moods m ON m.id = sm.mood_id WHERE sm.song_id = s.id AND ${APPROVED} AND m.slug = ANY(${groupRefs[0]})) DESC NULLS LAST, ${orderBy}`;
  }

  return { conditions, params, orderBy };
}
