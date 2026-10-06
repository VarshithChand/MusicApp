/**
 * Date helpers on plain "YYYY-MM-DD" strings. Records store the user's LOCAL calendar date, so grouping by day or month
 * never depends on the phone's time zone at the moment of reading. All arithmetic is done in UTC to avoid daylight-saving
 * and time-zone surprises. Pure functions, unit-tested.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) {
    return isLeapYear(y) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) {
    return false;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isValidMonth(s: string): boolean {
  const m = MONTH_RE.exec(s);
  if (!m) {
    return false;
  }
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12;
}

function toUtcMs(date: string): number {
  if (!isValidDate(date)) {
    throw new Error(`Invalid date: ${date}`);
  }
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function addDays(date: string, n: number): string {
  return fromUtcMs(toUtcMs(date) + n * DAY_MS);
}

/** Whole days from a to b (b - a). Same day = 0. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function monthOf(date: string): string {
  if (!isValidDate(date)) {
    throw new Error(`Invalid date: ${date}`);
  }
  return date.slice(0, 7);
}

export function monthStart(month: string): string {
  if (!isValidMonth(month)) {
    throw new Error(`Invalid month: ${month}`);
  }
  return `${month}-01`;
}

export function monthDayCount(month: string): number {
  if (!isValidMonth(month)) {
    throw new Error(`Invalid month: ${month}`);
  }
  const [y, m] = month.split('-').map(Number);
  return daysInMonth(y, m);
}

export function monthEnd(month: string): string {
  return `${month}-${String(monthDayCount(month)).padStart(2, '0')}`;
}

export function prevMonth(month: string): string {
  return monthOf(addDays(monthStart(month), -1));
}

export function nextMonth(month: string): string {
  return monthOf(addDays(monthEnd(month), 1));
}

/** Every date from `from` to `to`, both included. Empty if from is after to. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const n = diffDays(from, to);
  for (let i = 0; i <= n; i++) {
    out.push(addDays(from, i));
  }
  return out;
}

/** The phone's local calendar date for an instant, as YYYY-MM-DD. */
export function toLocalDateString(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Minutes east of UTC (IST = 330) for an instant, so a record keeps the offset it was entered under. */
export function tzOffsetMinutes(d: Date): number {
  return -d.getTimezoneOffset();
}

/** A Date at noon (phone time) on the given local date. Used to record an entry for another day, such as yesterday. */
export function localNoon(date: string): Date {
  if (!isValidDate(date)) {
    throw new Error(`Invalid date: ${date}`);
  }
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * A month as calendar rows, weeks starting on Sunday. Days outside the month are null.
 * Example: October 2026 starts on a Thursday, so the first row is [null, null, null, null, '2026-10-01', ...].
 */
export function monthGrid(month: string): (string | null)[][] {
  if (!isValidMonth(month)) {
    throw new Error(`Invalid month: ${month}`);
  }
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

/** Month arithmetic on "YYYY-MM". addMonths('2026-11', 3) = '2027-02'. */
export function addMonths(month: string, n: number): string {
  if (!isValidMonth(month)) {
    throw new Error(`Invalid month: ${month}`);
  }
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
}

/** Whole months from a to b (b - a). */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** The date for "day N of the month". A day that the month does not have (31 in April, 30 in February) becomes the last day. */
export function dateInMonth(month: string, day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`Invalid day of month: ${day}`);
  }
  return `${month}-${String(Math.min(day, monthDayCount(month))).padStart(2, '0')}`;
}
