/** @jest-environment node */
import { DatabaseSync } from 'node:sqlite';
import { loanStatus } from '../src/analytics/plan';
import { buildReminders } from '../src/analytics/reminders';
import { migrate, MIGRATIONS } from '../src/db/migrations';
import { Repos } from '../src/db/repos';
import { Db } from '../src/db/types';

type P = (string | number | boolean | null)[];
const norm = (p: P) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v)) as (string | number | null)[];

function memoryDb(): Db {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  return {
    async execute(sql, params = []) {
      const r = raw.prepare(sql).run(...norm(params));
      return /^\s*INSERT/i.test(sql) ? Number(r.lastInsertRowid) : Number(r.changes);
    },
    async query(sql, params = []) {
      return raw.prepare(sql).all(...norm(params)) as never;
    },
    async executeScript(statements) {
      raw.exec('BEGIN');
      try {
        for (const s of statements) {
          raw.exec(s);
        }
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

async function fresh() {
  const db = memoryDb();
  await migrate(db, () => '2026-10-06T00:00:00.000Z');
  return { db, repos: new Repos(db) };
}

const TODAY = '2026-10-10';

describe('upgrading an existing database to version 2', () => {
  it('keeps the data entered under version 1 and adds the new tables', async () => {
    const db = memoryDb();
    const v1 = MIGRATIONS.filter((m) => m.version === 1);
    expect(await migrate(db, undefined, v1)).toBe(1);
    await db.execute("INSERT INTO expenses (local_date, occurred_at, tz_offset_min, amount_minor, category_id, created_at, updated_at) VALUES ('2026-10-05','x',330,12000,1,'x','x')");
    await db.execute("INSERT INTO water_entries (local_date, occurred_at, tz_offset_min, amount_ml, created_at) VALUES ('2026-10-05','x',330,500,'x')");

    expect(await migrate(db)).toBe(MIGRATIONS.length - 1); // only the new migrations run
    expect((await db.query('SELECT amount_minor FROM expenses'))[0]).toEqual({ amount_minor: 12000 });
    expect((await db.query('SELECT amount_ml FROM water_entries'))[0]).toEqual({ amount_ml: 500 });
    await expect(db.query('SELECT * FROM loans')).resolves.toEqual([]);
    expect(await migrate(db)).toBe(0);
  });
});

describe('database rules for salary, loans and savings', () => {
  it('only allows one salary row and a pay day from 1 to 31', async () => {
    const { db } = await fresh();
    const ins = (id: number, day: number) => db.execute("INSERT INTO salary (id, pay_day, amount_minor, updated_at) VALUES (?, ?, NULL, 'x')", [id, day]);
    await expect(ins(1, 0)).rejects.toThrow();
    await expect(ins(1, 32)).rejects.toThrow();
    await expect(ins(2, 5)).rejects.toThrow();
    await expect(ins(1, 31)).resolves.toBeGreaterThan(0);
  });

  it('refuses a loan with a zero EMI, bad day, bad tenure or bad reminder days', async () => {
    const { db } = await fresh();
    const ins = (emi: number, day: number, tenure: number, remind: number) =>
      db.execute("INSERT INTO loans (name, emi_minor, deduction_day, start_month, tenure_months, remind_days_before, created_at, updated_at) VALUES ('L', ?, ?, '2026-10', ?, ?, 'x', 'x')", [emi, day, tenure, remind]);
    await expect(ins(0, 5, 12, 1)).rejects.toThrow();
    await expect(ins(100, 0, 12, 1)).rejects.toThrow();
    await expect(ins(100, 32, 12, 1)).rejects.toThrow();
    await expect(ins(100, 5, 0, 1)).rejects.toThrow();
    await expect(ins(100, 5, 601, 1)).rejects.toThrow();
    await expect(ins(100, 5, 12, 8)).rejects.toThrow();
    await expect(ins(100, 5, 12, 7)).resolves.toBeGreaterThan(0);
  });

  it('refuses a zero savings amount', async () => {
    const { db } = await fresh();
    await expect(db.execute("INSERT INTO savings_entries (local_date, occurred_at, tz_offset_min, amount_minor, created_at) VALUES ('2026-10-05','x',330,0,'x')")).rejects.toThrow();
  });
});

describe('salary', () => {
  it('is set once, can be changed, and can be cleared', async () => {
    const { repos } = await fresh();
    expect(await repos.getSalary()).toBeNull();
    await repos.setSalary(28, 5000000);
    expect(await repos.getSalary()).toEqual({ payDay: 28, amountMinor: 5000000 });
    await repos.setSalary(1, null);
    expect(await repos.getSalary()).toEqual({ payDay: 1, amountMinor: null });
    await repos.clearSalary();
    expect(await repos.getSalary()).toBeNull();
  });

  it('refuses a bad pay day or amount with a clear message', async () => {
    const { repos } = await fresh();
    await expect(repos.setSalary(0, null)).rejects.toThrow(/1 to 31/);
    await expect(repos.setSalary(32, null)).rejects.toThrow();
    await expect(repos.setSalary(5.5, null)).rejects.toThrow();
    await expect(repos.setSalary(5, 0)).rejects.toThrow(/greater than zero/);
    await expect(repos.setSalary(5, -100)).rejects.toThrow();
  });
});

describe('loans', () => {
  it('stores a loan once and calculates the rest: paid, remaining, next date, end date', async () => {
    const { repos } = await fresh();
    await repos.addLoan({ name: ' Bike loan ', emiMinor: 250000, deductionDay: 5, tenureMonths: 24, paidCount: 3, today: TODAY });
    const [l] = await repos.loans();
    expect(l).toMatchObject({ name: 'Bike loan', emiMinor: 250000, deductionDay: 5, tenureMonths: 24, remindDaysBefore: 1, active: true, startMonth: '2026-08' });
    const s = loanStatus(l, TODAY);
    expect(s.paid).toBe(3);
    expect(s.remaining).toBe(21);
    expect(s.nextDate).toBe('2026-11-05');
    expect(s.endDate).toBe('2028-07-05');
  });

  it('a new loan (0 paid) starts at the next deduction', async () => {
    const { repos } = await fresh();
    await repos.addLoan({ name: 'Phone', emiMinor: 100000, deductionDay: 20, tenureMonths: 6, paidCount: 0, today: TODAY });
    const [l] = await repos.loans();
    expect(l.startMonth).toBe('2026-10');
    expect(loanStatus(l, TODAY).nextDate).toBe('2026-10-20');
  });

  it('refuses incomplete or impossible loans', async () => {
    const { repos } = await fresh();
    const ok = { name: 'L', emiMinor: 100, deductionDay: 5, tenureMonths: 12, paidCount: 0, today: TODAY };
    await expect(repos.addLoan({ ...ok, name: '  ' })).rejects.toThrow(/name/);
    await expect(repos.addLoan({ ...ok, emiMinor: 0 })).rejects.toThrow(/EMI/);
    await expect(repos.addLoan({ ...ok, deductionDay: 40 })).rejects.toThrow(/day/);
    await expect(repos.addLoan({ ...ok, tenureMonths: 0 })).rejects.toThrow(/tenure/);
    await expect(repos.addLoan({ ...ok, paidCount: 12 })).rejects.toThrow(/already paid/);
    await expect(repos.addLoan({ ...ok, paidCount: -1 })).rejects.toThrow();
    await expect(repos.addLoan({ ...ok, remindDaysBefore: 9 })).rejects.toThrow(/Reminder days/);
    expect(await repos.loans()).toEqual([]);
  });

  it('can be switched off and deleted', async () => {
    const { repos } = await fresh();
    const id = await repos.addLoan({ name: 'L', emiMinor: 100, deductionDay: 5, tenureMonths: 12, paidCount: 0, today: TODAY });
    await repos.setLoanActive(id, false);
    expect((await repos.loans())[0].active).toBe(false);
    await repos.deleteLoan(id);
    expect(await repos.loans()).toEqual([]);
  });
});

describe('savings', () => {
  it('sets and clears a monthly target and records savings by date', async () => {
    const { repos } = await fresh();
    expect(await repos.savingsTargetMinor()).toBeNull();
    await repos.setSavingsTargetMinor(500000);
    expect(await repos.savingsTargetMinor()).toBe(500000);
    await repos.setSavingsTargetMinor(null);
    expect(await repos.savingsTargetMinor()).toBeNull();
    await expect(repos.setSavingsTargetMinor(0)).rejects.toThrow();

    await repos.addSavings(200000, new Date(2026, 9, 1, 10, 0), ' salary day ');
    await repos.addSavings(50000, new Date(2026, 9, 8, 10, 0));
    await repos.addSavings(70000, new Date(2026, 8, 30, 10, 0));
    const oct = await repos.savingsBetween('2026-10-01', '2026-10-31');
    expect(oct.map((x) => x.amountMinor)).toEqual([50000, 200000]);
    expect(oct[1].note).toBe('salary day');
    await repos.deleteSavings(oct[0].id);
    expect(await repos.savingsBetween('2026-10-01', '2026-10-31')).toHaveLength(1);
    await expect(repos.addSavings(0)).rejects.toThrow();
  });
});

describe('reminder settings and the reminders built from stored data', () => {
  it('defaults to on at 09:00 and validates the time', async () => {
    const { repos } = await fresh();
    expect(await repos.reminderSettings()).toEqual({ enabled: true, time: '09:00' });
    await repos.setReminderSettings(false, '07:45');
    expect(await repos.reminderSettings()).toEqual({ enabled: false, time: '07:45' });
    await expect(repos.setReminderSettings(true, '25:00')).rejects.toThrow(/hours and minutes/);
    expect(await repos.reminderSettings()).toEqual({ enabled: false, time: '07:45' }); // unchanged
  });

  it('end to end: stored salary and loan become the notifications to schedule', async () => {
    const { repos } = await fresh();
    await repos.setSalary(28, 5000000);
    await repos.setSavingsTargetMinor(500000);
    await repos.addLoan({ name: 'Bike loan', emiMinor: 250000, deductionDay: 5, tenureMonths: 24, paidCount: 3, today: TODAY });
    const settings = await repos.reminderSettings();
    const r = buildReminders({
      ...settings,
      today: TODAY,
      nowMinutes: 8 * 60,
      salary: await repos.getSalary(),
      savingsTargetMinor: await repos.savingsTargetMinor(),
      loans: await repos.loans(),
      horizonMonths: 2,
    });
    expect(r.map((x) => `${x.date} ${x.title}`)).toEqual([
      '2026-10-28 Salary day',
      '2026-11-04 EMI due tomorrow: Bike loan',
      '2026-11-28 Salary day',
      '2026-12-04 EMI due tomorrow: Bike loan',
      '2026-12-28 Salary day', // the horizon covers this month and the next two
    ]);
  });
});
