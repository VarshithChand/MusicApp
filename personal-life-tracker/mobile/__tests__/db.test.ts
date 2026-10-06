/** @jest-environment node */
import { DatabaseSync } from 'node:sqlite';
import { migrate, MIGRATIONS } from '../src/db/migrations';
import { Repos } from '../src/db/repos';
import { Db } from '../src/db/types';
import { monthSummary } from '../src/analytics/spending';
import { localNoon } from '../src/lib/dates';
import { dayNutrition, waterForDay } from '../src/analytics/wellness';

type P = (string | number | boolean | null)[];
const norm = (p: P) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v)) as (string | number | null)[];

/** An in-memory SQLite (Node's built-in) that behaves like the phone's database for these tests. */
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

// 5 Oct 2026, 11:30 pm and 6 Oct 2026, 00:10 am on the phone's clock
const lateNight = new Date(2026, 9, 5, 23, 30);
const justAfterMidnight = new Date(2026, 9, 6, 0, 10);

describe('migrations', () => {
  it('create the schema once and are safe to run again', async () => {
    const db = memoryDb();
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    expect(await migrate(db)).toBe(0);
    const v = await db.query<{ version: number }>('SELECT version FROM schema_migrations');
    expect(v.map((x) => x.version)).toEqual(MIGRATIONS.map((m) => m.version));
  });

  it('seed the default categories and the water target', async () => {
    const { repos } = await fresh();
    const cats = await repos.categories();
    expect(cats.map((c) => c.name)).toEqual(['Food', 'Travel', 'Shopping', 'Clothing', 'Room rent', 'EMI', 'Loan', 'Bills', 'Subscriptions', 'Other']);
    expect(cats.find((c) => c.name === 'EMI')?.isFixed).toBe(true);
    expect(cats.find((c) => c.name === 'Food')?.isFixed).toBe(false);
    expect(await repos.waterTargetMl()).toBe(3000);
  });

  it('apply a failing migration as a whole or not at all', async () => {
    const db = memoryDb();
    await expect(db.executeScript(['CREATE TABLE t (a INTEGER)', 'INSERT INTO t VALUES (1)', 'INSERT INTO missing_table VALUES (2)'])).rejects.toThrow();
    // nothing from the failed script remains
    await expect(db.query('SELECT * FROM t')).rejects.toThrow();
  });
});

describe('database rules (the database itself refuses bad data)', () => {
  it('refuses zero and negative amounts and unknown categories', async () => {
    const { db } = await fresh();
    const ins = (amount: number, cat: number) =>
      db.execute('INSERT INTO expenses (local_date, occurred_at, tz_offset_min, amount_minor, category_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', ['2026-10-05', 'x', 330, amount, cat, 'x', 'x']);
    await expect(ins(0, 1)).rejects.toThrow();
    await expect(ins(-5, 1)).rejects.toThrow();
    await expect(ins(100, 999)).rejects.toThrow(); // foreign key
    await expect(ins(100, 1)).resolves.toBeGreaterThan(0);
  });

  it('refuses water above 5 litres in one entry and zero', async () => {
    const { db } = await fresh();
    const ins = (ml: number) => db.execute('INSERT INTO water_entries (local_date, occurred_at, tz_offset_min, amount_ml, created_at) VALUES (?,?,?,?,?)', ['2026-10-05', 'x', 330, ml, 'x']);
    await expect(ins(0)).rejects.toThrow();
    await expect(ins(5001)).rejects.toThrow();
    await expect(ins(5000)).resolves.toBeGreaterThan(0);
  });

  it('refuses a second record with the same source and external id (a repeated Health Connect record)', async () => {
    const { db } = await fresh();
    const ins = (src: string, ext: string | null) =>
      db.execute('INSERT INTO water_entries (local_date, occurred_at, tz_offset_min, amount_ml, source, external_id, created_at) VALUES (?,?,?,?,?,?,?)', ['2026-10-05', 'x', 330, 250, src, ext, 'x']);
    await expect(ins('health_connect', 'abc')).resolves.toBeGreaterThan(0);
    await expect(ins('health_connect', 'abc')).rejects.toThrow();
    await expect(ins('health_connect', 'def')).resolves.toBeGreaterThan(0);
    await expect(ins('manual', null)).resolves.toBeGreaterThan(0);
    await expect(ins('manual', null)).resolves.toBeGreaterThan(0); // manual entries have no external id and may repeat
  });

  it('refuses negative food values and an unknown meal type or place', async () => {
    const { db } = await fresh();
    const base = ['2026-10-05', 'x', 330, 'lunch', 'Rice', 100, null, 'home', 'x', 'x'];
    const sql = 'INSERT INTO food_entries (local_date, occurred_at, tz_offset_min, meal_type, name, calories, cost_minor, place, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)';
    await expect(db.execute(sql, base as P)).resolves.toBeGreaterThan(0);
    await expect(db.execute(sql, [...base.slice(0, 5), -1, null, 'home', 'x', 'x'] as P)).rejects.toThrow();
    await expect(db.execute(sql, [...base.slice(0, 3), 'brunch', ...base.slice(4)] as P)).rejects.toThrow();
    await expect(db.execute(sql, [...base.slice(0, 7), 'moon', 'x', 'x'] as P)).rejects.toThrow();
  });
});

describe('expenses', () => {
  it('stores the phone-local date, so 11:30 pm stays on that day and 00:10 is the next day', async () => {
    const { repos } = await fresh();
    const cats = await repos.categories();
    await repos.addExpense({ amountMinor: 5000, categoryId: cats[0].id, now: lateNight });
    await repos.addExpense({ amountMinor: 7000, categoryId: cats[0].id, now: justAfterMidnight });
    const day5 = await repos.expensesBetween('2026-10-05', '2026-10-05');
    const day6 = await repos.expensesBetween('2026-10-06', '2026-10-06');
    expect(day5.map((e) => e.amountMinor)).toEqual([5000]);
    expect(day6.map((e) => e.amountMinor)).toEqual([7000]);
  });

  it('records an expense for an earlier date such as 3 October, and the month analytics include it', async () => {
    const { repos } = await fresh();
    const cats = await repos.categories();
    await repos.addExpense({ amountMinor: 100, categoryId: cats[0].id, now: localNoon('2026-10-03') }); // Rs 1
    await repos.addExpense({ amountMinor: 1000, categoryId: cats[0].id, now: localNoon('2026-10-10') }); // Rs 10
    const rows = await repos.expensesBetween('2026-10-01', '2026-10-31');
    expect(rows.map((r) => r.localDate).sort()).toEqual(['2026-10-03', '2026-10-10']);
    const s = monthSummary(rows, [], '2026-10', '2026-10-10');
    expect(s.totalMinor).toBe(1100);
    expect(s.knownDays).toBe(2);
  });

  it('refuses invalid amounts with a clear message', async () => {
    const { repos } = await fresh();
    await expect(repos.addExpense({ amountMinor: 0, categoryId: 1 })).rejects.toThrow(/greater than zero/);
    await expect(repos.addExpense({ amountMinor: -5, categoryId: 1 })).rejects.toThrow();
    await expect(repos.addExpense({ amountMinor: 10.5, categoryId: 1 })).rejects.toThrow();
  });

  it('lists with category and fixed flag, newest first, and can delete', async () => {
    const { repos } = await fresh();
    const cats = await repos.categories();
    const rent = cats.find((c) => c.name === 'Room rent')!;
    const id = await repos.addExpense({ amountMinor: 800000, categoryId: rent.id, note: ' October ', now: new Date(2026, 9, 1, 9, 0) });
    await repos.addExpense({ amountMinor: 20000, categoryId: cats[0].id, now: new Date(2026, 9, 2, 9, 0) });
    const list = await repos.expensesBetween('2026-10-01', '2026-10-31');
    expect(list.map((e) => e.amountMinor)).toEqual([20000, 800000]);
    expect(list[1]).toMatchObject({ category: 'Room rent', fixed: true, note: 'October' });
    await repos.deleteExpense(id);
    expect(await repos.expensesBetween('2026-10-01', '2026-10-31')).toHaveLength(1);
  });

  it('feeds the analytics: totals and average over recorded days', async () => {
    const { repos } = await fresh();
    const cats = await repos.categories();
    await repos.addExpense({ amountMinor: 10000, categoryId: cats[0].id, now: new Date(2026, 9, 1, 9, 0) });
    await repos.addExpense({ amountMinor: 30000, categoryId: cats[1].id, now: new Date(2026, 9, 3, 9, 0) });
    await repos.setSpendingComplete('2026-10-02', true);
    const rows = await repos.expensesBetween('2026-10-01', '2026-10-31');
    const days = await repos.dayStatusBetween('2026-10-01', '2026-10-31');
    const s = monthSummary(rows, days, '2026-10', '2026-10-03');
    expect(s.totalMinor).toBe(40000);
    expect(s.knownDays).toBe(3); // 1st, 2nd (marked complete, zero spend) and 3rd
    expect(s.average.value).toBe(13333);
    expect(s.average.estimated).toBe(false);
  });
});

describe('day status, budget and settings', () => {
  it('toggles "recorded everything" for a day', async () => {
    const { repos } = await fresh();
    await repos.setSpendingComplete('2026-10-05', true);
    expect(await repos.dayStatusBetween('2026-10-01', '2026-10-31')).toEqual([{ localDate: '2026-10-05', spendingComplete: true }]);
    await repos.setSpendingComplete('2026-10-05', false);
    expect(await repos.dayStatusBetween('2026-10-01', '2026-10-31')).toEqual([{ localDate: '2026-10-05', spendingComplete: false }]);
    await expect(repos.setSpendingComplete('2026-02-30', true)).rejects.toThrow();
  });

  it('sets and replaces a monthly budget, and rejects bad values', async () => {
    const { repos } = await fresh();
    expect(await repos.getBudget('2026-10')).toBeNull();
    await repos.setBudget('2026-10', 2000000);
    await repos.setBudget('2026-10', 2500000);
    expect(await repos.getBudget('2026-10')).toBe(2500000);
    await expect(repos.setBudget('2026-10', 0)).rejects.toThrow();
    await expect(repos.setBudget('2026-13', 100)).rejects.toThrow();
  });

  it('keeps the water target within a sensible range', async () => {
    const { repos } = await fresh();
    await repos.setWaterTargetMl(2500);
    expect(await repos.waterTargetMl()).toBe(2500);
    await expect(repos.setWaterTargetMl(100)).rejects.toThrow();
    await expect(repos.setWaterTargetMl(20000)).rejects.toThrow();
  });
});

describe('water and food', () => {
  it('adds quick-add water entries and sums the day', async () => {
    const { repos } = await fresh();
    await repos.addWater(250, new Date(2026, 9, 5, 8, 0));
    await repos.addWater(500, new Date(2026, 9, 5, 13, 0));
    await repos.addWater(1000, new Date(2026, 9, 4, 20, 0));
    const rows = await repos.waterBetween('2026-10-01', '2026-10-31');
    expect(waterForDay(rows, '2026-10-05')).toBe(750);
    await expect(repos.addWater(0)).rejects.toThrow();
    await expect(repos.addWater(6000)).rejects.toThrow();
    await expect(repos.addWater(250.5)).rejects.toThrow();
  });

  it('adds food with optional nutrition and cost, and validates input', async () => {
    const { repos } = await fresh();
    await repos.addFood({ mealType: 'lunch', name: ' Rice and dal ', calories: 450, proteinG: 15, costMinor: 8000, place: 'home', now: new Date(2026, 9, 5, 13, 0) });
    await repos.addFood({ mealType: 'tea_coffee', name: 'Tea', now: new Date(2026, 9, 5, 16, 0) });
    const rows = await repos.foodBetween('2026-10-05', '2026-10-05');
    expect(rows).toHaveLength(2);
    const n = dayNutrition(rows, '2026-10-05');
    expect(n.calories).toBe(450);
    expect(n.partial).toBe(true); // the tea has no calories entered
    await expect(repos.addFood({ mealType: 'lunch', name: '   ' })).rejects.toThrow(/what you ate/);
    await expect(repos.addFood({ mealType: 'lunch', name: 'x', calories: -5 })).rejects.toThrow(/negative/);
    await expect(repos.addFood({ mealType: 'brunch' as never, name: 'x' })).rejects.toThrow(/meal type/);
  });
});
