import {
  averageDailySpending,
  categoryBreakdown,
  cleanExpenses,
  coverageConfidence,
  dailyTotals,
  fixedVsVariable,
  highestCategory,
  highestSpendingDay,
  knownDays,
  monthOverMonthChange,
  monthSummary,
  spendingTotal,
} from '../src/analytics/spending';
import { DayRow, ExpenseRow } from '../src/analytics/types';

let nextId = 1;
const ex = (localDate: string, amountMinor: number, category = 'Food', fixed = false, id?: number): ExpenseRow => ({
  id: id ?? nextId++,
  localDate,
  amountMinor,
  category,
  fixed,
});
const done = (localDate: string): DayRow => ({ localDate, spendingComplete: true });

beforeEach(() => {
  nextId = 1;
});

describe('zero and missing data', () => {
  it('zero expenses: total 0 and no average (insufficient data), never a made-up number', () => {
    const s = monthSummary([], [], '2026-10', '2026-10-10');
    expect(s.totalMinor).toBe(0);
    expect(s.knownDays).toBe(0);
    expect(s.average.value).toBeNull();
    expect(s.average.confidence).toBe('NONE');
    expect(s.average.note).toMatch(/insufficient data/i);
    expect(s.projection.value).toBeNull();
  });

  it('a day marked "recorded everything" with no spending is a real zero, not unknown', () => {
    const avg = averageDailySpending([], [done('2026-10-01'), done('2026-10-02')], '2026-10-01', '2026-10-02');
    expect(avg.value).toBe(0);
    expect(avg.estimated).toBe(false);
    expect(avg.confidence).toBe('HIGH');
  });

  it('partial days: the average uses only recorded days and is labelled estimated', () => {
    const rows = [ex('2026-10-01', 10000), ex('2026-10-02', 20000), ex('2026-10-03', 30000)];
    const avg = averageDailySpending(rows, [], '2026-10-01', '2026-10-10');
    expect(avg.value).toBe(20000); // 60000 / 3 recorded days, NOT 60000 / 10
    expect(avg.estimated).toBe(true);
    expect(avg.confidence).toBe('LOW'); // 3 of 10 days
    expect(avg.note).toMatch(/3 of 10/);
  });

  it('confidence follows how many days were recorded', () => {
    expect(coverageConfidence(8, 10)).toBe('HIGH');
    expect(coverageConfidence(5, 10)).toBe('MEDIUM');
    expect(coverageConfidence(4, 10)).toBe('LOW');
    expect(coverageConfidence(0, 10)).toBe('NONE');
    expect(coverageConfidence(3, 0)).toBe('NONE');
  });

  it('an empty or reversed range gives no average', () => {
    expect(averageDailySpending([ex('2026-10-05', 100)], [], '2026-10-10', '2026-10-01').value).toBeNull();
  });
});

describe('invalid and duplicate records', () => {
  it('ignores negative, zero, fractional and badly dated rows and counts them', () => {
    const rows = [
      ex('2026-10-01', 5000),
      ex('2026-10-01', -300),
      ex('2026-10-01', 0),
      ex('2026-10-01', 12.5),
      ex('2026-02-30', 700),
      ex('garbage', 700),
    ];
    const c = cleanExpenses(rows);
    expect(c.valid).toHaveLength(1);
    expect(c.invalid).toBe(5);
    expect(spendingTotal(rows, '2026-10-01', '2026-10-31')).toBe(5000);
  });

  it('a repeated record id is counted once', () => {
    const rows = [ex('2026-10-01', 5000, 'Food', false, 7), ex('2026-10-01', 5000, 'Food', false, 7), ex('2026-10-02', 100, 'Food', false, 8)];
    const c = cleanExpenses(rows);
    expect(c.valid).toHaveLength(2);
    expect(c.duplicates).toBe(1);
    expect(spendingTotal(rows, '2026-10-01', '2026-10-31')).toBe(5100);
  });

  it('reports bad rows in the month summary', () => {
    const s = monthSummary([ex('2026-10-01', 100), ex('2026-10-01', -1), ex('2026-10-01', 100, 'Food', false, 1)], [], '2026-10', '2026-10-05');
    expect(s.invalidRows).toBe(1);
    expect(s.duplicateRows).toBe(1);
  });
});

describe('month boundaries and leap years', () => {
  it('keeps 30 Sept and 1 Oct in different months', () => {
    const rows = [ex('2026-09-30', 1000), ex('2026-10-01', 2000)];
    expect(spendingTotal(rows, '2026-09-01', '2026-09-30')).toBe(1000);
    expect(spendingTotal(rows, '2026-10-01', '2026-10-31')).toBe(2000);
  });

  it('handles the year boundary in month comparisons', () => {
    const rows = [ex('2025-12-31', 1000), ex('2026-01-01', 1500)];
    const c = monthOverMonthChange(rows, [], '2026-01');
    expect(c.value).toBe(50);
  });

  it('uses 29 days in February of a leap year and 28 otherwise', () => {
    expect(monthSummary([], [], '2024-02', '2024-03-05').totalDays).toBe(29);
    expect(monthSummary([], [], '2026-02', '2026-03-05').totalDays).toBe(28);
  });

  it('counts the elapsed days of the current month, a finished month and a future month', () => {
    expect(monthSummary([], [], '2026-10', '2026-10-10').elapsedDays).toBe(10);
    expect(monthSummary([], [], '2026-10', '2026-10-31').elapsedDays).toBe(31);
    expect(monthSummary([], [], '2026-09', '2026-10-10').elapsedDays).toBe(30);
    expect(monthSummary([], [], '2026-11', '2026-10-10').elapsedDays).toBe(0);
  });

  it('the first day of the month counts as one elapsed day', () => {
    expect(monthSummary([], [], '2026-10', '2026-10-01').elapsedDays).toBe(1);
  });
});

describe('month summary, projection and budget', () => {
  const rows = [ex('2026-10-01', 100000), ex('2026-10-03', 50000), ex('2026-10-05', 150000), ex('2026-10-07', 100000), ex('2026-10-09', 100000)];

  it('totals the recorded spending', () => {
    const s = monthSummary(rows, [], '2026-10', '2026-10-10');
    expect(s.totalMinor).toBe(500000);
    expect(s.knownDays).toBe(5);
  });

  it('projects the month from recorded days and always labels it estimated', () => {
    const s = monthSummary(rows, [], '2026-10', '2026-10-10');
    expect(s.average.value).toBe(100000); // 500000 over 5 recorded days
    expect(s.projection.value).toBe(3100000); // 100000 x 31
    expect(s.projection.estimated).toBe(true);
    expect(s.projection.confidence).toBe('MEDIUM');
  });

  it('a very early projection has low confidence', () => {
    const s = monthSummary([ex('2026-10-01', 100000)], [], '2026-10', '2026-10-03');
    expect(s.projection.confidence).toBe('LOW');
  });

  it('a finished month reports its total, estimated only if some days were never recorded', () => {
    const s = monthSummary(rows, [], '2026-10', '2026-11-02');
    expect(s.projection.value).toBe(500000);
    expect(s.projection.estimated).toBe(true);
    expect(s.projection.note).toMatch(/5 of 31/);
  });

  it('calculates the remaining budget and utilisation', () => {
    const s = monthSummary(rows, [], '2026-10', '2026-10-10', 2000000);
    expect(s.budget?.remainingMinor).toBe(1500000);
    expect(s.budget?.utilizationPercent).toBe(25);
  });

  it('shows an overspent budget as negative, not as zero', () => {
    const s = monthSummary(rows, [], '2026-10', '2026-10-10', 400000);
    expect(s.budget?.remainingMinor).toBe(-100000);
    expect(s.budget?.utilizationPercent).toBe(125);
  });

  it('no budget set gives no budget figures', () => {
    expect(monthSummary(rows, [], '2026-10', '2026-10-10').budget).toBeNull();
    expect(monthSummary(rows, [], '2026-10', '2026-10-10', 0).budget).toBeNull();
  });

  it('rejects an invalid month or date', () => {
    expect(() => monthSummary([], [], '2026-13', '2026-10-10')).toThrow();
    expect(() => monthSummary([], [], '2026-10', '2026-10-40')).toThrow();
  });
});

describe('categories, highest day and fixed vs variable', () => {
  const rows = [
    ex('2026-10-01', 30000, 'Food'),
    ex('2026-10-02', 20000, 'Food'),
    ex('2026-10-02', 50000, 'Travel'),
    ex('2026-10-03', 100000, 'Room rent', true),
  ];

  it('ranks categories with their share of the total', () => {
    const b = categoryBreakdown(rows, '2026-10-01', '2026-10-31');
    // Travel and Food tie at 25%; ties are ordered by name so the result is stable.
    expect(b.map((c) => c.category)).toEqual(['Room rent', 'Food', 'Travel']);
    expect(b[0].percent).toBe(50);
    expect(b[1].percent).toBe(25);
    expect(b[2].percent).toBe(25);
    expect(b.reduce((s, c) => s + c.percent, 0)).toBe(100);
    expect(highestCategory(rows, '2026-10-01', '2026-10-31')?.category).toBe('Room rent');
  });

  it('breaks ties by name so results are stable', () => {
    const t = [ex('2026-10-01', 100, 'B'), ex('2026-10-01', 100, 'A')];
    expect(categoryBreakdown(t, '2026-10-01', '2026-10-31').map((c) => c.category)).toEqual(['A', 'B']);
  });

  it('finds the highest-spending day and prefers the earlier date on a tie', () => {
    expect(highestSpendingDay(rows, '2026-10-01', '2026-10-31')).toEqual({ date: '2026-10-03', totalMinor: 100000 });
    const t = [ex('2026-10-05', 500), ex('2026-10-02', 500)];
    expect(highestSpendingDay(t, '2026-10-01', '2026-10-31')?.date).toBe('2026-10-02');
  });

  it('returns nothing for an empty period', () => {
    expect(highestCategory([], '2026-10-01', '2026-10-31')).toBeNull();
    expect(highestSpendingDay([], '2026-10-01', '2026-10-31')).toBeNull();
    expect(categoryBreakdown([], '2026-10-01', '2026-10-31')).toEqual([]);
  });

  it('splits fixed and variable spending', () => {
    expect(fixedVsVariable(rows, '2026-10-01', '2026-10-31')).toEqual({ fixedMinor: 100000, variableMinor: 100000 });
  });

  it('sums per day', () => {
    expect(dailyTotals(rows, '2026-10-01', '2026-10-31')).toEqual({ '2026-10-01': 30000, '2026-10-02': 70000, '2026-10-03': 100000 });
  });

  it('knows which days are known', () => {
    const k = knownDays(rows, [done('2026-10-09'), { localDate: '2026-10-08', spendingComplete: false }], '2026-10-01', '2026-10-31');
    expect([...k].sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-09']);
  });
});

describe('month over month change', () => {
  it('compares with the previous month, e.g. food 28% higher', () => {
    const rows = [ex('2026-09-10', 100000, 'Food'), ex('2026-10-10', 128000, 'Food')];
    const c = monthOverMonthChange(rows, [], '2026-10', 'Food');
    expect(c.value).toBe(28);
    expect(c.estimated).toBe(true); // only one recorded day in each month
    expect(c.confidence).toBe('LOW');
  });

  it('gives no percentage when the previous month has no spending', () => {
    const c = monthOverMonthChange([ex('2026-10-10', 128000)], [], '2026-10');
    expect(c.value).toBeNull();
    expect(c.confidence).toBe('NONE');
  });

  it('gives no percentage when the current month has nothing recorded', () => {
    expect(monthOverMonthChange([ex('2026-09-10', 5000)], [], '2026-10').value).toBeNull();
  });

  it('shows a decrease as a negative percentage', () => {
    const rows = [ex('2026-09-10', 200000), ex('2026-10-10', 150000)];
    expect(monthOverMonthChange(rows, [], '2026-10').value).toBe(-25);
  });
});
