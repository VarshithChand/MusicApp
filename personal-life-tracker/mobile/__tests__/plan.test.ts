import { installmentDate, LoanRow, loanStatus, monthEmiTotal, monthObligations, monthPlan, nextSalaryDate, startMonthFor } from '../src/analytics/plan';
import { addMonths, dateInMonth, monthsBetween } from '../src/lib/dates';

const loan = (over: Partial<LoanRow> = {}): LoanRow => ({
  id: 1,
  name: 'Bike loan',
  emiMinor: 250000,
  deductionDay: 5,
  startMonth: '2026-08',
  tenureMonths: 24,
  remindDaysBefore: 1,
  active: true,
  ...over,
});

describe('month arithmetic', () => {
  it('adds and subtracts months across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-06', 0)).toBe('2026-06');
    expect(addMonths('2026-12', 24)).toBe('2028-12');
  });

  it('counts months between', () => {
    expect(monthsBetween('2026-08', '2026-10')).toBe(2);
    expect(monthsBetween('2026-10', '2026-08')).toBe(-2);
    expect(monthsBetween('2025-12', '2026-02')).toBe(2);
  });

  it('puts "day 31" on the last day of shorter months, including a leap February', () => {
    expect(dateInMonth('2026-04', 31)).toBe('2026-04-30');
    expect(dateInMonth('2026-02', 30)).toBe('2026-02-28');
    expect(dateInMonth('2024-02', 30)).toBe('2024-02-29');
    expect(dateInMonth('2026-10', 31)).toBe('2026-10-31');
    expect(() => dateInMonth('2026-10', 0)).toThrow();
    expect(() => dateInMonth('2026-10', 32)).toThrow();
  });
});

describe('loan schedule', () => {
  it('dates each instalment', () => {
    const l = loan();
    expect(installmentDate(l, 1)).toBe('2026-08-05');
    expect(installmentDate(l, 24)).toBe('2028-07-05');
    expect(() => installmentDate(l, 0)).toThrow();
    expect(() => installmentDate(l, 25)).toThrow();
  });

  it('counts paid and remaining instalments, and the next date', () => {
    const s = loanStatus(loan(), '2026-10-10'); // Aug, Sep, Oct 5th have passed
    expect(s.paid).toBe(3);
    expect(s.remaining).toBe(21);
    expect(s.nextInstallment).toBe(4);
    expect(s.nextDate).toBe('2026-11-05');
    expect(s.daysToNext).toBe(26);
    expect(s.endDate).toBe('2028-07-05');
    expect(s.remainingMinor).toBe(21 * 250000);
    expect(s.finished).toBe(false);
  });

  it('an instalment due today is the next one, not yet paid', () => {
    const s = loanStatus(loan(), '2026-10-05');
    expect(s.paid).toBe(2);
    expect(s.nextInstallment).toBe(3);
    expect(s.daysToNext).toBe(0);
  });

  it('a loan that has not started has all instalments remaining', () => {
    const s = loanStatus(loan({ startMonth: '2027-01' }), '2026-10-10');
    expect(s.paid).toBe(0);
    expect(s.remaining).toBe(24);
    expect(s.nextDate).toBe('2027-01-05');
  });

  it('a finished loan has no next date', () => {
    const s = loanStatus(loan({ tenureMonths: 3 }), '2026-12-01');
    expect(s.finished).toBe(true);
    expect(s.paid).toBe(3);
    expect(s.nextDate).toBeNull();
    expect(s.remainingMinor).toBe(0);
  });

  it('works for a one-instalment loan and for a deduction day of 31', () => {
    expect(loanStatus(loan({ tenureMonths: 1 }), '2026-08-05').nextInstallment).toBe(1);
    const l = loan({ deductionDay: 31, startMonth: '2026-01', tenureMonths: 12 });
    expect(installmentDate(l, 2)).toBe('2026-02-28');
    expect(installmentDate(l, 4)).toBe('2026-04-30');
    expect(installmentDate(l, 12)).toBe('2026-12-31');
  });
});

describe('"I have already paid N EMIs"', () => {
  it('works out the start month so the app agrees with the number the user gave', () => {
    for (const [today, day, paid] of [
      ['2026-10-10', 5, 3],
      ['2026-10-03', 5, 3],
      ['2026-10-05', 5, 0],
      ['2026-10-10', 5, 0],
      ['2026-01-02', 15, 7],
      ['2026-03-31', 31, 1],
    ] as [string, number, number][]) {
      const start = startMonthFor(day, paid, today);
      const s = loanStatus(loan({ deductionDay: day, startMonth: start, tenureMonths: 36 }), today);
      expect(s.paid).toBe(paid);
    }
  });

  it('a brand-new loan starts this month if the deduction day is still ahead, else next month', () => {
    expect(startMonthFor(20, 0, '2026-10-10')).toBe('2026-10');
    expect(startMonthFor(5, 0, '2026-10-10')).toBe('2026-11');
  });
});

describe('what falls in a month', () => {
  const loans = [loan(), loan({ id: 2, name: 'Phone', emiMinor: 50000, deductionDay: 1, startMonth: '2026-10', tenureMonths: 6 }), loan({ id: 3, name: 'Old', startMonth: '2024-01', tenureMonths: 12 }), loan({ id: 4, name: 'Stopped', active: false })];

  it('lists active instalments in the month with their number', () => {
    const o = monthObligations(loans, '2026-10');
    expect(o.map((x) => [x.loan.name, x.k, x.date])).toEqual([
      ['Bike loan', 3, '2026-10-05'],
      ['Phone', 1, '2026-10-01'],
    ]);
    expect(monthEmiTotal(loans, '2026-10')).toBe(300000);
    expect(monthEmiTotal(loans, '2026-09')).toBe(250000);
    expect(monthEmiTotal(loans, '2030-01')).toBe(0);
  });
});

describe('salary date', () => {
  it('is today if today is pay day, later this month, or next month', () => {
    expect(nextSalaryDate({ payDay: 10, amountMinor: null }, '2026-10-10')).toBe('2026-10-10');
    expect(nextSalaryDate({ payDay: 28, amountMinor: null }, '2026-10-10')).toBe('2026-10-28');
    expect(nextSalaryDate({ payDay: 1, amountMinor: null }, '2026-10-10')).toBe('2026-11-01');
    expect(nextSalaryDate({ payDay: 31, amountMinor: null }, '2026-11-10')).toBe('2026-11-30');
    expect(nextSalaryDate({ payDay: 15, amountMinor: null }, '2026-12-20')).toBe('2027-01-15');
  });
});

describe('month plan and savings', () => {
  const base = { loans: [loan()], month: '2026-10', targetMinor: 500000, savedMinor: 200000, spendingEstimated: false };

  it('income minus EMIs minus other spending, and savings progress', () => {
    const p = monthPlan({ ...base, salary: { payDay: 1, amountMinor: 5000000 }, spendingByCategory: [{ category: 'Food', totalMinor: 800000 }, { category: 'Travel', totalMinor: 200000 }] });
    expect(p.emiMinor).toBe(250000);
    expect(p.otherSpendingMinor).toBe(1000000);
    expect(p.leftMinor).toBe(3750000);
    expect(p.targetPercent).toBe(40);
  });

  it('does not count an EMI twice when it was also entered as an expense', () => {
    const p = monthPlan({ ...base, salary: { payDay: 1, amountMinor: 5000000 }, spendingByCategory: [{ category: 'EMI', totalMinor: 250000 }, { category: 'Food', totalMinor: 100000 }] });
    expect(p.otherSpendingMinor).toBe(100000);
    expect(p.leftMinor).toBe(4650000);
  });

  it('gives no "left" figure without a salary amount, and passes the estimate flag on', () => {
    const p = monthPlan({ ...base, salary: { payDay: 1, amountMinor: null }, spendingByCategory: [], spendingEstimated: true });
    expect(p.leftMinor).toBeNull();
    expect(p.incomeMinor).toBeNull();
    expect(p.estimated).toBe(true);
  });

  it('a negative result means spending is above income', () => {
    const p = monthPlan({ ...base, salary: { payDay: 1, amountMinor: 300000 }, spendingByCategory: [{ category: 'Food', totalMinor: 400000 }] });
    expect(p.leftMinor).toBe(-350000);
  });

  it('no target means no percentage', () => {
    const p = monthPlan({ ...base, targetMinor: null, salary: null, spendingByCategory: [] });
    expect(p.targetPercent).toBeNull();
    expect(p.leftMinor).toBeNull();
  });
});
