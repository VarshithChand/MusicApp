import { addDays, datesBetween, diffDays, isValidDate, isValidMonth, monthDayCount, monthEnd, monthStart, prevMonth } from '../lib/dates';
import { Confidence, DayRow, ExpenseRow, Fact } from './types';

/**
 * Deterministic spending analytics. Rules that apply everywhere here:
 *  - invalid rows (bad date, non-positive or non-integer amount) and repeated ids are ignored, and counted;
 *  - a day counts as KNOWN only if it has at least one expense or the user marked it "recorded everything";
 *  - averages use known days only, so a day nobody recorded is never silently treated as 0;
 *  - anything that rests on unknown days or a forecast is flagged `estimated` with a confidence level.
 */

export function coverageConfidence(known: number, total: number): Confidence {
  if (total <= 0 || known <= 0) {
    return 'NONE';
  }
  const c = known / total;
  if (c >= 0.8) {
    return 'HIGH';
  }
  if (c >= 0.5) {
    return 'MEDIUM';
  }
  return 'LOW';
}

const ORDER: Confidence[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
export function weakest(a: Confidence, b: Confidence): Confidence {
  return ORDER[Math.min(ORDER.indexOf(a), ORDER.indexOf(b))];
}

export interface CleanedExpenses {
  valid: ExpenseRow[];
  invalid: number;
  duplicates: number;
}

export function cleanExpenses(rows: ExpenseRow[]): CleanedExpenses {
  const seen = new Set<number>();
  const valid: ExpenseRow[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const r of rows) {
    if (!isValidDate(r.localDate) || !Number.isInteger(r.amountMinor) || r.amountMinor <= 0) {
      invalid++;
      continue;
    }
    if (seen.has(r.id)) {
      duplicates++;
      continue;
    }
    seen.add(r.id);
    valid.push(r);
  }
  return { valid, invalid, duplicates };
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to; // YYYY-MM-DD strings sort like dates
}

export function spendingTotal(rows: ExpenseRow[], from: string, to: string): number {
  return cleanExpenses(rows).valid.filter((r) => inRange(r.localDate, from, to)).reduce((s, r) => s + r.amountMinor, 0);
}

/** Dates in [from, to] that are known: an expense exists, or the user marked the day complete. */
export function knownDays(rows: ExpenseRow[], days: DayRow[], from: string, to: string): Set<string> {
  const known = new Set<string>();
  for (const r of cleanExpenses(rows).valid) {
    if (inRange(r.localDate, from, to)) {
      known.add(r.localDate);
    }
  }
  for (const d of days) {
    if (d.spendingComplete && isValidDate(d.localDate) && inRange(d.localDate, from, to)) {
      known.add(d.localDate);
    }
  }
  return known;
}

export function dailyTotals(rows: ExpenseRow[], from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of cleanExpenses(rows).valid) {
    if (inRange(r.localDate, from, to)) {
      out[r.localDate] = (out[r.localDate] ?? 0) + r.amountMinor;
    }
  }
  return out;
}

export function averageDailySpending(rows: ExpenseRow[], days: DayRow[], from: string, to: string): Fact<number> {
  if (diffDays(from, to) < 0) {
    return { value: null, estimated: false, confidence: 'NONE', note: 'Insufficient data to calculate this reliably.' };
  }
  const total = datesBetween(from, to).length;
  const known = knownDays(rows, days, from, to).size;
  if (known === 0) {
    return { value: null, estimated: false, confidence: 'NONE', note: 'Insufficient data to calculate this reliably.' };
  }
  const sum = spendingTotal(rows, from, to);
  return {
    value: Math.round(sum / known),
    estimated: known < total,
    confidence: coverageConfidence(known, total),
    note: known < total ? `Based on ${known} of ${total} days that were recorded.` : undefined,
  };
}

export interface CategoryShare {
  category: string;
  totalMinor: number;
  percent: number; // of the period total, one decimal
  fixed: boolean;
}

export function categoryBreakdown(rows: ExpenseRow[], from: string, to: string): CategoryShare[] {
  const valid = cleanExpenses(rows).valid.filter((r) => inRange(r.localDate, from, to));
  const total = valid.reduce((s, r) => s + r.amountMinor, 0);
  const map = new Map<string, { sum: number; fixed: boolean }>();
  for (const r of valid) {
    const cur = map.get(r.category) ?? { sum: 0, fixed: r.fixed };
    cur.sum += r.amountMinor;
    map.set(r.category, cur);
  }
  return [...map.entries()]
    .map(([category, v]) => ({
      category,
      totalMinor: v.sum,
      percent: total === 0 ? 0 : Math.round((v.sum / total) * 1000) / 10,
      fixed: v.fixed,
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor || a.category.localeCompare(b.category));
}

export function highestCategory(rows: ExpenseRow[], from: string, to: string): CategoryShare | null {
  return categoryBreakdown(rows, from, to)[0] ?? null;
}

export function highestSpendingDay(rows: ExpenseRow[], from: string, to: string): { date: string; totalMinor: number } | null {
  const t = dailyTotals(rows, from, to);
  let best: { date: string; totalMinor: number } | null = null;
  for (const [date, totalMinor] of Object.entries(t)) {
    if (!best || totalMinor > best.totalMinor || (totalMinor === best.totalMinor && date < best.date)) {
      best = { date, totalMinor };
    }
  }
  return best;
}

export function fixedVsVariable(rows: ExpenseRow[], from: string, to: string): { fixedMinor: number; variableMinor: number } {
  let fixedMinor = 0;
  let variableMinor = 0;
  for (const r of cleanExpenses(rows).valid) {
    if (inRange(r.localDate, from, to)) {
      if (r.fixed) {
        fixedMinor += r.amountMinor;
      } else {
        variableMinor += r.amountMinor;
      }
    }
  }
  return { fixedMinor, variableMinor };
}

export interface MonthSummary {
  month: string;
  /** Days of the month that have already happened (up to today). */
  elapsedDays: number;
  totalDays: number;
  knownDays: number;
  totalMinor: number;
  average: Fact<number>;
  /** Forecast of the month's total. Always `estimated` while the month is still running. */
  projection: Fact<number>;
  budget: { budgetMinor: number; remainingMinor: number; utilizationPercent: number; estimated: boolean } | null;
  invalidRows: number;
  duplicateRows: number;
}

export function monthSummary(
  rows: ExpenseRow[],
  days: DayRow[],
  month: string,
  today: string,
  budgetMinor: number | null = null,
): MonthSummary {
  if (!isValidMonth(month) || !isValidDate(today)) {
    throw new Error('Invalid month or date');
  }
  const start = monthStart(month);
  const end = monthEnd(month);
  const totalDays = monthDayCount(month);
  const elapsedDays = today < start ? 0 : today >= end ? totalDays : diffDays(start, today) + 1;
  const to = elapsedDays === 0 ? start : addDays(start, elapsedDays - 1);
  const cleaned = cleanExpenses(rows);
  const total = spendingTotal(rows, start, end);
  const known = knownDays(rows, days, start, end).size;
  const average = elapsedDays === 0 ? ({ value: null, estimated: false, confidence: 'NONE', note: 'This month has not started.' } as Fact<number>) : averageDailySpending(rows, days, start, to);

  let projection: Fact<number>;
  if (elapsedDays === 0) {
    projection = { value: null, estimated: false, confidence: 'NONE', note: 'This month has not started.' };
  } else if (elapsedDays === totalDays) {
    // The month is over: the total is what was recorded; it is only an estimate if some days were never recorded.
    projection = {
      value: total,
      estimated: known < totalDays,
      confidence: coverageConfidence(known, totalDays),
      note: known < totalDays ? `Only ${known} of ${totalDays} days were recorded.` : undefined,
    };
  } else if (average.value === null) {
    projection = { value: null, estimated: true, confidence: 'NONE', note: 'Insufficient data to calculate this reliably.' };
  } else {
    projection = {
      value: Math.round(average.value * totalDays),
      estimated: true,
      confidence: average.confidence === 'HIGH' && elapsedDays >= 10 ? 'HIGH' : average.confidence === 'NONE' ? 'NONE' : elapsedDays < 7 ? 'LOW' : 'MEDIUM',
      note: `Average of recorded days so far x ${totalDays} days.`,
    };
  }

  const budget =
    budgetMinor && budgetMinor > 0
      ? {
          budgetMinor,
          remainingMinor: budgetMinor - total,
          utilizationPercent: Math.round((total / budgetMinor) * 1000) / 10,
          estimated: known < Math.max(elapsedDays, 1),
        }
      : null;

  return {
    month,
    elapsedDays,
    totalDays,
    knownDays: known,
    totalMinor: total,
    average,
    projection,
    budget,
    invalidRows: cleaned.invalid,
    duplicateRows: cleaned.duplicates,
  };
}

/**
 * Change versus the previous month, in percent (one decimal). Null when the previous month has no recorded spending
 * (a percentage of nothing is meaningless) or either month has no known days.
 */
export function monthOverMonthChange(
  rows: ExpenseRow[],
  days: DayRow[],
  month: string,
  category: string | null = null,
): Fact<number> {
  const prev = prevMonth(month);
  const filter = (m: string) => {
    const from = monthStart(m);
    const to = monthEnd(m);
    const sel = category ? rows.filter((r) => r.category === category) : rows;
    return { total: spendingTotal(sel, from, to), known: knownDays(rows, days, from, to).size, days: monthDayCount(m) };
  };
  const cur = filter(month);
  const old = filter(prev);
  if (cur.known === 0 || old.known === 0 || old.total === 0) {
    return { value: null, estimated: false, confidence: 'NONE', note: 'Insufficient data to calculate this reliably.' };
  }
  const conf = weakest(coverageConfidence(cur.known, cur.days), coverageConfidence(old.known, old.days));
  return {
    value: Math.round(((cur.total - old.total) / old.total) * 1000) / 10,
    estimated: cur.known < cur.days || old.known < old.days,
    confidence: conf,
    note: 'Compares totals of recorded days only.',
  };
}
