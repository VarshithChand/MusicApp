import { addDays, datesBetween, isValidDate } from '../lib/dates';
import { coverageConfidence } from './spending';
import { Fact, FoodRow, WaterRow } from './types';

/** Water and food analytics. Same rules as spending: bad rows ignored, missing data never treated as zero. */

// ---------------------------------------------------------------- water

export function cleanWater(rows: WaterRow[]): WaterRow[] {
  const seen = new Set<number>();
  const out: WaterRow[] = [];
  for (const r of rows) {
    if (!isValidDate(r.localDate) || !Number.isFinite(r.ml) || r.ml <= 0) {
      continue;
    }
    if (r.id !== undefined) {
      if (seen.has(r.id)) {
        continue;
      }
      seen.add(r.id);
    }
    out.push(r);
  }
  return out;
}

export function waterForDay(rows: WaterRow[], date: string): number {
  return cleanWater(rows)
    .filter((r) => r.localDate === date)
    .reduce((s, r) => s + r.ml, 0);
}

export interface WaterDay {
  date: string;
  ml: number;
  logged: boolean; // false = nothing recorded that day (unknown, not "0 ml")
  met: boolean;
}

export function waterGoalProgress(rows: WaterRow[], date: string, targetMl: number): { ml: number; percent: number; met: boolean } {
  const ml = waterForDay(rows, date);
  const percent = targetMl > 0 ? Math.round((ml / targetMl) * 1000) / 10 : 0;
  return { ml, percent, met: targetMl > 0 && ml >= targetMl };
}

/** The last `days` days ending at `endDate`, oldest first. */
export function recentWater(rows: WaterRow[], endDate: string, targetMl: number, days = 7): WaterDay[] {
  const clean = cleanWater(rows);
  return datesBetween(addDays(endDate, -(days - 1)), endDate).map((date) => {
    const todays = clean.filter((r) => r.localDate === date);
    const ml = todays.reduce((s, r) => s + r.ml, 0);
    return { date, ml, logged: todays.length > 0, met: targetMl > 0 && ml >= targetMl };
  });
}

/** "Target met on N of the last 7 days". Days with nothing recorded count as not met, and make the result estimated. */
export function waterGoalDays(rows: WaterRow[], endDate: string, targetMl: number, days = 7): Fact<number> {
  const recent = recentWater(rows, endDate, targetMl, days);
  const logged = recent.filter((d) => d.logged).length;
  if (logged === 0) {
    return { value: null, estimated: false, confidence: 'NONE', note: 'Insufficient data to calculate this reliably.' };
  }
  return {
    value: recent.filter((d) => d.met).length,
    estimated: logged < days,
    confidence: coverageConfidence(logged, days),
    note: logged < days ? `${days - logged} of ${days} days have no water recorded.` : undefined,
  };
}

export function averageDailyWater(rows: WaterRow[], from: string, to: string): Fact<number> {
  const clean = cleanWater(rows).filter((r) => r.localDate >= from && r.localDate <= to);
  const byDay = new Map<string, number>();
  for (const r of clean) {
    byDay.set(r.localDate, (byDay.get(r.localDate) ?? 0) + r.ml);
  }
  const total = datesBetween(from, to).length;
  if (byDay.size === 0) {
    return { value: null, estimated: false, confidence: 'NONE', note: 'Insufficient data to calculate this reliably.' };
  }
  const sum = [...byDay.values()].reduce((a, b) => a + b, 0);
  return { value: Math.round(sum / byDay.size), estimated: byDay.size < total, confidence: coverageConfidence(byDay.size, total) };
}

// ---------------------------------------------------------------- food

function cleanFood(rows: FoodRow[]): FoodRow[] {
  const seen = new Set<number>();
  const out: FoodRow[] = [];
  for (const r of rows) {
    if (!isValidDate(r.localDate) || !r.name.trim()) {
      continue;
    }
    if (r.id !== undefined) {
      if (seen.has(r.id)) {
        continue;
      }
      seen.add(r.id);
    }
    out.push(r);
  }
  return out;
}

export interface DayNutrition {
  entries: number;
  calories: number;
  proteinG: number;
  /** Some entries had no calorie (or protein) value, so the totals are lower bounds, not exact. */
  partial: boolean;
  entriesWithoutCalories: number;
}

export function dayNutrition(rows: FoodRow[], date: string): DayNutrition {
  const day = cleanFood(rows).filter((r) => r.localDate === date);
  let calories = 0;
  let proteinG = 0;
  let missing = 0;
  for (const r of day) {
    if (r.calories === null || r.calories < 0) {
      missing++;
    } else {
      calories += r.calories;
    }
    if (r.proteinG !== null && r.proteinG >= 0) {
      proteinG += r.proteinG;
    }
  }
  return { entries: day.length, calories, proteinG: Math.round(proteinG * 10) / 10, partial: missing > 0, entriesWithoutCalories: missing };
}

export function foodSpending(rows: FoodRow[], from: string, to: string): { totalMinor: number; restaurantMinor: number; entriesWithoutCost: number } {
  let totalMinor = 0;
  let restaurantMinor = 0;
  let missing = 0;
  for (const r of cleanFood(rows)) {
    if (r.localDate < from || r.localDate > to) {
      continue;
    }
    if (r.costMinor === null || r.costMinor < 0) {
      missing++;
      continue;
    }
    totalMinor += r.costMinor;
    if (r.place === 'restaurant') {
      restaurantMinor += r.costMinor;
    }
  }
  return { totalMinor, restaurantMinor, entriesWithoutCost: missing };
}

export function frequentFoods(rows: FoodRow[], from: string, to: string, limit = 5): { name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const r of cleanFood(rows)) {
    if (r.localDate < from || r.localDate > to) {
      continue;
    }
    const key = r.name.trim().toLowerCase();
    const cur = counts.get(key) ?? { name: r.name.trim(), count: 0 };
    cur.count++;
    counts.set(key, cur);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Share of total spending that was food, in percent. Null when there is no spending to compare against. */
export function foodShareOfSpending(foodMinor: number, totalSpendingMinor: number): number | null {
  if (totalSpendingMinor <= 0) {
    return null;
  }
  return Math.round((foodMinor / totalSpendingMinor) * 1000) / 10;
}
