/**
 * The Today screen is a personal dashboard: the owner chooses which cards to show and in what order. The choice is stored
 * as an ordered list of card ids; a card that is not in the list is hidden.
 */

export type CardId = 'money' | 'coming' | 'month' | 'water' | 'food' | 'insights';

export const CARD_LABELS: Record<CardId, string> = {
  money: 'Spent today',
  coming: 'Coming up (salary, EMI, savings)',
  month: 'This month',
  water: 'Water',
  food: 'Food and meal times',
  insights: 'Insights',
};

export const ALL_CARDS = Object.keys(CARD_LABELS) as CardId[];

/** What a new install shows: short, the day's essentials. The rest can be switched on. */
export const DEFAULT_CARDS: CardId[] = ['money', 'water', 'food', 'coming'];

/** Reads the stored text. Unknown ids and repeats are dropped; nothing stored gives the default. */
export function parseCards(text: string | null): CardId[] {
  if (text === null) {
    return [...DEFAULT_CARDS];
  }
  const seen = new Set<string>();
  const out: CardId[] = [];
  for (const part of text.split(',')) {
    const id = part.trim();
    if ((ALL_CARDS as string[]).includes(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id as CardId);
    }
  }
  return out;
}

export const serializeCards = (cards: CardId[]): string => cards.join(',');

export function toggleCard(cards: CardId[], id: CardId): CardId[] {
  return cards.includes(id) ? cards.filter((c) => c !== id) : [...cards, id];
}

/** Moves a shown card one place up (-1) or down (+1). Hidden cards and moves past either end change nothing. */
export function moveCard(cards: CardId[], id: CardId, step: -1 | 1): CardId[] {
  const i = cards.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= cards.length) {
    return cards;
  }
  const next = [...cards];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
