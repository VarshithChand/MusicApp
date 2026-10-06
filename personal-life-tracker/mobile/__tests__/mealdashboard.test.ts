/** @jest-environment node */
import { DatabaseSync } from 'node:sqlite';
import { ReminderItem } from '../src/analytics/reminders';
import { ALL_CARDS, DEFAULT_CARDS, moveCard, parseCards, serializeCards, toggleCard } from '../src/analytics/dashboard';
import { buildMealReminders, DEFAULT_MEAL_REMINDERS, MealReminderSettings, nextMealToday, validateMealSlots } from '../src/analytics/mealReminders';
import { migrate } from '../src/db/migrations';
import { Repos } from '../src/db/repos';
import { Db } from '../src/db/types';
import { Notifier, syncReminders } from '../src/notify/sync';

const on: MealReminderSettings = { ...DEFAULT_MEAL_REMINDERS, enabled: true };
const base = { settings: on, today: '2026-10-10', nowMinutes: 7 * 60, loggedToday: [] as string[] };

describe('meal-time reminders', () => {
  it('is empty until switched on', () => {
    expect(buildMealReminders({ ...base, settings: DEFAULT_MEAL_REMINDERS })).toEqual([]);
  });

  it('gives four a day for three days, in the food channel', () => {
    const items = buildMealReminders(base);
    expect(items).toHaveLength(12);
    expect(items.slice(0, 4).map((i) => [i.time, i.title])).toEqual([
      ['08:30', 'Time for breakfast'],
      ['13:00', 'Time for lunch'],
      ['17:00', 'Time for snack'],
      ['20:00', 'Time for dinner'],
    ]);
    expect(items.every((i) => i.channel === 'food')).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(12);
  });

  it('skips meal times that have passed today', () => {
    const items = buildMealReminders({ ...base, nowMinutes: 13 * 60 });
    expect(items.filter((i) => i.date === '2026-10-10').map((i) => i.time)).toEqual(['17:00', '20:00']);
  });

  it('does not remind again today about a meal already recorded, but does tomorrow', () => {
    const items = buildMealReminders({ ...base, loggedToday: ['breakfast', 'lunch'] });
    expect(items.filter((i) => i.date === '2026-10-10').map((i) => i.title)).toEqual(['Time for snack', 'Time for dinner']);
    expect(items.filter((i) => i.date === '2026-10-11')).toHaveLength(4);
  });

  it('a meal switched off is never reminded', () => {
    const settings = { ...on, slots: on.slots.map((s) => (s.meal === 'snack' ? { ...s, enabled: false } : s)) };
    expect(buildMealReminders({ ...base, settings }).some((i) => i.id.endsWith('snack'))).toBe(false);
  });

  it('custom times are used, and an invalid time gives no reminders instead of a crash', () => {
    const custom = { ...on, slots: on.slots.map((s) => (s.meal === 'lunch' ? { ...s, time: '12:15' } : s)) };
    expect(buildMealReminders({ ...base, settings: custom })[1].time).toBe('12:15');
    const bad = { ...on, slots: on.slots.map((s) => (s.meal === 'lunch' ? { ...s, time: '25:00' } : s)) };
    expect(validateMealSlots(bad.slots)).toMatch(/lunch/);
    expect(buildMealReminders({ ...base, settings: bad })).toEqual([]);
  });

  it('works across a year end', () => {
    expect(buildMealReminders({ ...base, today: '2026-12-31' }).map((i) => i.date)).toContain('2027-01-01');
  });

  it('next meal for the dashboard', () => {
    expect(nextMealToday(on, 9 * 60, [])?.meal).toBe('lunch');
    expect(nextMealToday(on, 9 * 60, ['lunch'])?.meal).toBe('snack');
    expect(nextMealToday(on, 21 * 60, [])).toBeNull();
    expect(nextMealToday(DEFAULT_MEAL_REMINDERS, 6 * 60, [])).toBeNull();
  });
});

describe('dashboard cards', () => {
  it('a fresh install shows the short default', () => {
    expect(parseCards(null)).toEqual(DEFAULT_CARDS);
    expect(DEFAULT_CARDS.length).toBeLessThan(ALL_CARDS.length);
  });

  it('stored text keeps its order, drops unknown and repeated cards, and can be empty', () => {
    expect(parseCards('water, money,water,bogus,month')).toEqual(['water', 'money', 'month']);
    expect(parseCards('')).toEqual([]);
  });

  it('toggles and moves cards', () => {
    expect(toggleCard(['money'], 'water')).toEqual(['money', 'water']);
    expect(toggleCard(['money', 'water'], 'money')).toEqual(['water']);
    expect(moveCard(['money', 'water', 'food'], 'food', -1)).toEqual(['money', 'food', 'water']);
    expect(moveCard(['money', 'water'], 'money', -1)).toEqual(['money', 'water']);
    expect(moveCard(['money', 'water'], 'water', 1)).toEqual(['money', 'water']);
    expect(moveCard(['money'], 'month', 1)).toEqual(['money']);
  });

  it('round-trips through its stored text', () => {
    const cards = ['insights', 'money'] as const;
    expect(parseCards(serializeCards([...cards]))).toEqual([...cards]);
  });
});

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
class FakeNotifier implements Notifier {
  last: ReminderItem[] = [];
  async setSchedule(items: ReminderItem[]) {
    this.last = items;
    return items.length;
  }
  async status() {
    return { enabled: true };
  }
  async requestPermission() {
    return true;
  }
}
const NOW = new Date(2026, 9, 10, 7, 0);

describe('stored settings and syncing', () => {
  async function setup() {
    const db = memoryDb();
    await migrate(db);
    return { repos: new Repos(db), notifier: new FakeNotifier() };
  }

  it('meal reminders are off by default and nothing is scheduled', async () => {
    const { repos, notifier } = await setup();
    expect((await repos.mealReminderSettings()).enabled).toBe(false);
    await syncReminders(repos, notifier, NOW);
    expect(notifier.last).toEqual([]);
  });

  it('saves times and switches, reads them back, and rejects a bad time without changing anything', async () => {
    const { repos } = await setup();
    const s = await repos.mealReminderSettings();
    const next = { enabled: true, slots: s.slots.map((x) => (x.meal === 'dinner' ? { ...x, time: '21:15', enabled: false } : x)) };
    await repos.setMealReminderSettings(next);
    const back = await repos.mealReminderSettings();
    expect(back.enabled).toBe(true);
    expect(back.slots.find((x) => x.meal === 'dinner')).toMatchObject({ time: '21:15', enabled: false });
    await expect(repos.setMealReminderSettings({ enabled: true, slots: s.slots.map((x) => ({ ...x, time: 'noon' })) })).rejects.toThrow(/hours and minutes/);
    expect((await repos.mealReminderSettings()).slots.find((x) => x.meal === 'dinner')?.time).toBe('21:15');
  });

  it('recording lunch removes today\'s lunch reminder on the next sync', async () => {
    const { repos, notifier } = await setup();
    await repos.setMealReminderSettings({ ...(await repos.mealReminderSettings()), enabled: true });
    await syncReminders(repos, notifier, NOW);
    expect(notifier.last.some((i) => i.id === 'food-2026-10-10-lunch')).toBe(true);
    await repos.addFood({ mealType: 'lunch', name: 'Rice', now: NOW });
    await syncReminders(repos, notifier, NOW);
    expect(notifier.last.some((i) => i.id === 'food-2026-10-10-lunch')).toBe(false);
    expect(notifier.last.some((i) => i.id === 'food-2026-10-11-lunch')).toBe(true);
  });

  it('food, water and money reminders coexist, sorted by time', async () => {
    const { repos, notifier } = await setup();
    await repos.setSalary(10, null);
    await repos.setMealReminderSettings({ ...(await repos.mealReminderSettings()), enabled: true });
    await repos.setWaterReminderSettings({ enabled: true, start: '09:00', end: '21:00', intervalMin: 180, stopAtTarget: true });
    await syncReminders(repos, notifier, NOW);
    expect(new Set(notifier.last.map((i) => i.channel ?? 'money'))).toEqual(new Set(['money', 'water', 'food']));
    const keys = notifier.last.map((i) => i.date + i.time);
    expect([...keys].sort()).toEqual(keys);
  });

  it('the dashboard choice is stored and an empty choice stays empty', async () => {
    const { repos } = await setup();
    expect(await repos.dashboardCards()).toEqual(DEFAULT_CARDS);
    await repos.setDashboardCards(['insights', 'money']);
    expect(await repos.dashboardCards()).toEqual(['insights', 'money']);
    await repos.setDashboardCards([]);
    expect(await repos.dashboardCards()).toEqual([]);
  });
});
