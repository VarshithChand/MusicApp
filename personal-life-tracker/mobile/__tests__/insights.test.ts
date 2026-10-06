import { buildInsights } from '../src/analytics/insights';
import { categoryBreakdown, monthOverMonthChange, monthSummary } from '../src/analytics/spending';
import { ExpenseRow, Fact } from '../src/analytics/types';

const none: Fact<number> = { value: null, estimated: false, confidence: 'NONE' };
let id = 1;
const ex = (localDate: string, amountMinor: number, category = 'Food'): ExpenseRow => ({ id: id++, localDate, amountMinor, category, fixed: false });

function build(rows: ExpenseRow[], budget: number | null = null, water: Fact<number> = none) {
  const summary = monthSummary(rows, [], '2026-10', '2026-10-10', budget);
  return buildInsights({
    summary,
    breakdown: categoryBreakdown(rows, '2026-10-01', '2026-10-31'),
    foodChange: monthOverMonthChange(rows, [], '2026-10', 'Food'),
    waterGoalDays: water,
  });
}

beforeEach(() => {
  id = 1;
});

describe('insight sentences', () => {
  it('says there is nothing to show yet when there is no data, and invents nothing', () => {
    expect(build([])).toEqual(['Add a few days of entries to see insights here.']);
  });

  it('reports the highest category with its numbers', () => {
    const t = build([ex('2026-10-01', 30000, 'Food'), ex('2026-10-02', 70000, 'Travel')]);
    expect(t[0]).toBe('Travel is your highest spending category this month (70% of ₹1,000).');
  });

  it('describes food change versus last month and states its confidence', () => {
    const t = build([ex('2026-09-10', 100000), ex('2026-10-10', 128000)]);
    expect(t.some((s) => s.startsWith('Food spending is 28% higher than last month') && s.includes('low confidence'))).toBe(true);
  });

  it('does not mention a food change when there is no previous month to compare with', () => {
    const t = build([ex('2026-10-10', 128000)]);
    expect(t.some((s) => s.includes('than last month'))).toBe(false);
  });

  it('marks the average as an estimate when days are missing', () => {
    const t = build([ex('2026-10-01', 10000), ex('2026-10-02', 20000)]);
    expect(t.find((s) => s.startsWith('Your average'))).toMatch(/estimate/);
  });

  it('warns about the budget with the projection labelled as an estimate', () => {
    const rows = [ex('2026-10-01', 100000), ex('2026-10-02', 100000), ex('2026-10-03', 100000), ex('2026-10-04', 100000), ex('2026-10-05', 100000)];
    const over = build(rows, 1000000);
    expect(over.some((s) => s.includes('may spend about') && s.includes('(estimate)'))).toBe(true);
    const used = build(rows, 400000);
    expect(used.some((s) => s.includes("used 125% of this month's budget"))).toBe(true);
    const fine = build([ex('2026-10-01', 1000)], 5000000);
    expect(fine.some((s) => s.includes('left'))).toBe(true);
  });

  it('reports water goal days only when they could be calculated', () => {
    expect(build([ex('2026-10-01', 100)], null, { value: 3, estimated: true, confidence: 'LOW' }).some((s) => s.includes('3 of the last 7 days') && s.includes('no water recorded'))).toBe(true);
    expect(build([ex('2026-10-01', 100)]).some((s) => s.includes('water'))).toBe(false);
  });
});
