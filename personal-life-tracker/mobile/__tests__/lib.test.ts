import {
  addDays,
  datesBetween,
  daysInMonth,
  diffDays,
  isLeapYear,
  isValidDate,
  isValidMonth,
  localNoon,
  monthDayCount,
  monthEnd,
  monthGrid,
  monthOf,
  nextMonth,
  prevMonth,
  toLocalDateString,
  tzOffsetMinutes,
} from '../src/lib/dates';
import { formatInr, parseAmountToMinor } from '../src/lib/money';

describe('dates: leap years and month lengths', () => {
  it('knows leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
  });

  it('gives the right month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(monthDayCount('2024-02')).toBe(29);
    expect(monthEnd('2026-02')).toBe('2026-02-28');
  });

  it('rejects dates that do not exist', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-00-10')).toBe(false);
    expect(isValidDate('2026-4-5')).toBe(false);
    expect(isValidDate('not a date')).toBe(false);
    expect(isValidMonth('2026-12')).toBe(true);
    expect(isValidMonth('2026-13')).toBe(false);
  });
});

describe('dates: month boundaries', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('moves between months across the year boundary', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2025-12')).toBe('2026-01');
    expect(prevMonth('2024-03')).toBe('2024-02');
    expect(monthOf('2026-10-31')).toBe('2026-10');
  });

  it('counts days and lists ranges inclusively', () => {
    expect(diffDays('2026-10-01', '2026-10-01')).toBe(0);
    expect(diffDays('2026-02-28', '2026-03-01')).toBe(1);
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2);
    expect(datesBetween('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(datesBetween('2026-10-05', '2026-10-01')).toEqual([]);
  });

  it('throws on an invalid date instead of guessing', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });
});

describe('dates: time zones', () => {
  it('uses the phone local calendar date, so late evening stays on the same day', () => {
    expect(toLocalDateString(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05');
    expect(toLocalDateString(new Date(2026, 9, 6, 0, 5))).toBe('2026-10-06');
    expect(toLocalDateString(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    expect(toLocalDateString(new Date(2024, 1, 29, 12, 0))).toBe('2024-02-29');
  });

  it('builds noon on a given local date, so an entry for yesterday lands on yesterday', () => {
    expect(toLocalDateString(localNoon('2026-10-05'))).toBe('2026-10-05');
    expect(toLocalDateString(localNoon('2024-02-29'))).toBe('2024-02-29');
    expect(() => localNoon('2026-02-30')).toThrow();
  });

  it('keeps the offset east of UTC as a signed number of minutes', () => {
    const d = new Date(2026, 9, 5, 12, 0);
    expect(tzOffsetMinutes(d)).toBe(-d.getTimezoneOffset());
  });
});

describe('money', () => {
  it('parses what a person types into paise', () => {
    expect(parseAmountToMinor('120')).toBe(12000);
    expect(parseAmountToMinor('120.5')).toBe(12050);
    expect(parseAmountToMinor('120.55')).toBe(12055);
    expect(parseAmountToMinor('1,200.75')).toBe(120075);
    expect(parseAmountToMinor(' 5 ')).toBe(500);
    expect(parseAmountToMinor('0.05')).toBe(5);
  });

  it('rejects zero, negative, too many decimals, text and empty', () => {
    expect(parseAmountToMinor('0')).toBeNull();
    expect(parseAmountToMinor('0.00')).toBeNull();
    expect(parseAmountToMinor('-5')).toBeNull();
    expect(parseAmountToMinor('1.234')).toBeNull();
    expect(parseAmountToMinor('abc')).toBeNull();
    expect(parseAmountToMinor('')).toBeNull();
    expect(parseAmountToMinor('1e3')).toBeNull();
    expect(parseAmountToMinor('99999999999999999999')).toBeNull();
  });

  it('avoids floating-point errors', () => {
    expect(parseAmountToMinor('0.1')).toBe(10);
    expect(parseAmountToMinor('0.3')).toBe(30);
    expect(parseAmountToMinor('19.99')).toBe(1999);
  });

  it('formats rupees with Indian digit grouping', () => {
    expect(formatInr(12345)).toBe('₹123.45');
    expect(formatInr(12300)).toBe('₹123');
    expect(formatInr(0)).toBe('₹0');
    expect(formatInr(123456700)).toBe('₹12,34,567');
    expect(formatInr(100000)).toBe('₹1,000');
    expect(formatInr(10000000)).toBe('₹1,00,000');
    expect(formatInr(-500)).toBe('-₹5');
  });
});

describe('calendar grid', () => {
  it('lays out October 2026 (starts on a Thursday) in weeks starting on Sunday', () => {
    const g = monthGrid('2026-10');
    expect(g[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(g[1][0]).toBe('2026-10-04');
    expect(g[g.length - 1].filter(Boolean).pop()).toBe('2026-10-31');
    expect(g.every((row) => row.length === 7)).toBe(true);
    expect(g.flat().filter(Boolean)).toHaveLength(31);
  });

  it('handles a leap February (29 days) and a February that fits exactly in 4 weeks', () => {
    const leap = monthGrid('2024-02'); // starts on a Thursday
    expect(leap.flat().filter(Boolean)).toHaveLength(29);
    expect(leap[0][4]).toBe('2024-02-01');
    expect(leap).toHaveLength(5);
    const exact = monthGrid('2026-02'); // starts on a Sunday, 28 days
    expect(exact).toHaveLength(4);
    expect(exact[0][0]).toBe('2026-02-01');
    expect(exact[3][6]).toBe('2026-02-28');
  });

  it('rejects an invalid month', () => {
    expect(() => monthGrid('2026-13')).toThrow();
  });
});
