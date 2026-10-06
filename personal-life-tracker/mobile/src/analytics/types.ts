/** How much to trust a result. NONE means there was not enough data to calculate it at all. */
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/**
 * A calculated number together with how reliable it is. `estimated` is true whenever the result relies on a guess
 * (for example a projection, or an average over days that were never recorded). `value` is null when there is
 * "insufficient data to calculate this reliably": missing data is NEVER treated as zero.
 */
export interface Fact<T> {
  value: T | null;
  estimated: boolean;
  confidence: Confidence;
  note?: string;
}

export interface ExpenseRow {
  id: number;
  localDate: string; // YYYY-MM-DD
  amountMinor: number; // paise
  category: string;
  fixed: boolean;
}

/** The user can mark a day as "I recorded everything", which is how a day with no spending is told apart from a day not recorded. */
export interface DayRow {
  localDate: string;
  spendingComplete: boolean;
}

export interface WaterRow {
  id?: number;
  localDate: string;
  ml: number;
}

export type Place = 'home' | 'restaurant' | 'outside';

export interface FoodRow {
  id?: number;
  localDate: string;
  name: string;
  mealType: string;
  calories: number | null;
  proteinG: number | null;
  costMinor: number | null;
  place: Place | null;
}
