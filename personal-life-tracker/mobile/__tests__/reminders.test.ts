import { LoanRow } from '../src/analytics/plan';
import { buildReminders, parseReminderTime, ReminderInput } from '../src/analytics/reminders';

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

const input = (over: Partial<ReminderInput> = {}): ReminderInput => ({
  enabled: true,
  time: '09:00',
  today: '2026-10-10',
  nowMinutes: 8 * 60,
  salary: null,
  savingsTargetMinor: null,
  loans: [],
  ...over,
});

describe('reminder time', () => {
  it('parses 24-hour times and rejects nonsense', () => {
    expect(parseReminderTime('09:30')).toEqual({ hour: 9, minute: 30 });
    expect(parseReminderTime('9:05')).toEqual({ hour: 9, minute: 5 });
    expect(parseReminderTime('23:59')).toEqual({ hour: 23, minute: 59 });
    expect(parseReminderTime('24:00')).toBeNull();
    expect(parseReminderTime('12:60')).toBeNull();
    expect(parseReminderTime('noon')).toBeNull();
    expect(parseReminderTime('')).toBeNull();
  });

  it('falls back to 09:00 when the time is invalid', () => {
    const r = buildReminders(input({ time: 'bad', loans: [loan()] }));
    expect(r[0].time).toBe('09:00');
  });
});

describe('EMI reminders', () => {
  it('schedules one per upcoming instalment, the chosen days before the deduction, with the numbers', () => {
    const r = buildReminders(input({ loans: [loan()], horizonMonths: 3 }));
    expect(r[0]).toMatchObject({ id: 'loan-1-4', date: '2026-11-04', time: '09:00', title: 'EMI due tomorrow: Bike loan' });
    expect(r[0].text).toContain('₹2,500 on 2026-11-05');
    expect(r[0].text).toContain('instalment 4 of 24');
    expect(r[0].text).toContain('20 left after this');
    expect(r.map((x) => x.id)).toEqual(['loan-1-4', 'loan-1-5', 'loan-1-6']); // Nov, Dec, Jan: three months ahead
  });

  it('a reminder across a month boundary falls in the earlier month', () => {
    const r = buildReminders(input({ loans: [loan({ deductionDay: 1, startMonth: '2026-11' })], horizonMonths: 2 }));
    expect(r[0].date).toBe('2026-10-31');
    expect(r[0].title).toBe('EMI due tomorrow: Bike loan');
  });

  it('supports reminding on the day, 3 days before, and the last instalment wording', () => {
    const today = buildReminders(input({ loans: [loan({ remindDaysBefore: 0 })], horizonMonths: 1 }));
    expect(today[0].title).toBe('EMI due today: Bike loan');
    expect(today[0].date).toBe('2026-11-05');
    const three = buildReminders(input({ loans: [loan({ remindDaysBefore: 3 })], horizonMonths: 1 }));
    expect(three[0].title).toBe('EMI due in 3 days: Bike loan');
    expect(three[0].date).toBe('2026-11-02');
    const last = buildReminders(input({ loans: [loan({ tenureMonths: 4 })], horizonMonths: 12 }));
    expect(last).toHaveLength(1);
    expect(last[0].text).toContain('this is the last instalment');
  });

  it('skips a reminder whose time has already passed today and ones in the past', () => {
    // EMI due 2026-10-11, reminder 1 day before = today 09:00
    const l = loan({ deductionDay: 11, startMonth: '2026-10', tenureMonths: 3 });
    const early = buildReminders(input({ loans: [l], nowMinutes: 8 * 60, horizonMonths: 1 }));
    expect(early[0].date).toBe('2026-10-10');
    const late = buildReminders(input({ loans: [l], nowMinutes: 10 * 60, horizonMonths: 1 }));
    expect(late[0].date).toBe('2026-11-10'); // today's 09:00 is gone, so the next one is next month's
  });

  it('ignores inactive and finished loans', () => {
    expect(buildReminders(input({ loans: [loan({ active: false })] }))).toEqual([]);
    expect(buildReminders(input({ loans: [loan({ tenureMonths: 2 })] }))).toEqual([]);
  });

  it('sorts several loans by date and keeps ids unique', () => {
    const r = buildReminders(input({ loans: [loan(), loan({ id: 2, name: 'Phone', deductionDay: 20, startMonth: '2026-10', tenureMonths: 5 })], horizonMonths: 2 }));
    const dates = r.map((x) => x.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length);
  });
});

describe('salary reminders', () => {
  it('reminds on pay day with the amount and the savings amount to set aside', () => {
    const r = buildReminders(input({ salary: { payDay: 28, amountMinor: 5000000 }, savingsTargetMinor: 500000, horizonMonths: 2 }));
    expect(r[0]).toMatchObject({ id: 'salary-2026-10-28', date: '2026-10-28', title: 'Salary day' });
    expect(r[0].text).toBe('Salary is expected today (₹50,000). Set aside ₹5,000 for savings.');
    expect(r.map((x) => x.date)).toEqual(['2026-10-28', '2026-11-28', '2026-12-28']);
  });

  it('works without an amount or a savings target', () => {
    const r = buildReminders(input({ salary: { payDay: 28, amountMinor: null }, horizonMonths: 1 }));
    expect(r[0].text).toBe('Salary is expected today.');
  });

  it('puts day 31 on the last day of short months', () => {
    const r = buildReminders(input({ salary: { payDay: 31, amountMinor: null }, today: '2026-01-15', horizonMonths: 2 }));
    expect(r.map((x) => x.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('switching reminders off', () => {
  it('returns nothing when reminders are disabled', () => {
    expect(buildReminders(input({ enabled: false, loans: [loan()], salary: { payDay: 1, amountMinor: null } }))).toEqual([]);
  });
});
