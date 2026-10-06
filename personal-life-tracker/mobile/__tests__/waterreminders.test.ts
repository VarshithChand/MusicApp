/** @jest-environment node */
import { DatabaseSync } from 'node:sqlite';
import { ReminderItem } from '../src/analytics/reminders';
import { buildWaterReminders, DEFAULT_WATER_REMINDERS, validateWaterReminders, WaterReminderSettings } from '../src/analytics/waterReminders';
import { migrate } from '../src/db/migrations';
import { Repos } from '../src/db/repos';
import { Db } from '../src/db/types';
import { Notifier, syncReminders } from '../src/notify/sync';

const on: WaterReminderSettings = { ...DEFAULT_WATER_REMINDERS, enabled: true };
const base = { settings: on, today: '2026-10-10', nowMinutes: 8 * 60, todayMl: 0, targetMl: 3000 };

describe('water reminder times', () => {
  it('is empty when switched off (the default)', () => {
    expect(buildWaterReminders({ ...base, settings: DEFAULT_WATER_REMINDERS })).toEqual([]);
  });

  it('every 2 hours from 09:00 to 21:00 gives 7 a day, for 3 days', () => {
    const items = buildWaterReminders(base);
    expect(items).toHaveLength(21);
    expect(items.slice(0, 7).map((i) => i.time)).toEqual(['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00']);
    expect(new Set(items.map((i) => i.date))).toEqual(new Set(['2026-10-10', '2026-10-11', '2026-10-12']));
    expect(items.every((i) => i.channel === 'water')).toBe(true);
  });

  it('leaves out times that have already passed today', () => {
    const items = buildWaterReminders({ ...base, nowMinutes: 13 * 60 });
    expect(items.filter((i) => i.date === '2026-10-10').map((i) => i.time)).toEqual(['15:00', '17:00', '19:00', '21:00']);
    expect(items.filter((i) => i.date === '2026-10-11')).toHaveLength(7);
  });

  it('a reminder exactly at the current minute is not scheduled in the past', () => {
    const items = buildWaterReminders({ ...base, nowMinutes: 11 * 60 });
    expect(items.find((i) => i.date === '2026-10-10')?.time).toBe('13:00');
  });

  it('stops for the rest of today once the target is reached, but not tomorrow', () => {
    const items = buildWaterReminders({ ...base, todayMl: 3000 });
    expect(items.some((i) => i.date === '2026-10-10')).toBe(false);
    expect(items.some((i) => i.date === '2026-10-11')).toBe(true);
  });

  it('keeps reminding after the target when "stop at target" is off', () => {
    const items = buildWaterReminders({ ...base, settings: { ...on, stopAtTarget: false }, todayMl: 3500 });
    expect(items.some((i) => i.date === '2026-10-10')).toBe(true);
  });

  it('shows the amount so far, or says nothing is recorded (never "0")', () => {
    expect(buildWaterReminders({ ...base, todayMl: 1250 })[0].text).toBe('You have had 1.25 L of 3 L today.');
    expect(buildWaterReminders(base)[0].text).toBe('Nothing recorded yet today. Target 3 L.');
    expect(buildWaterReminders(base).find((i) => i.date === '2026-10-11')?.text).toBe("Today's target is 3 L.");
  });

  it('works across a month and year end', () => {
    const items = buildWaterReminders({ ...base, today: '2026-12-31', days: 2 });
    expect(items.map((i) => i.date)).toContain('2027-01-01');
  });

  it('an end time that is not on the interval simply stops before it', () => {
    const items = buildWaterReminders({ ...base, settings: { ...on, start: '08:30', end: '12:00', intervalMin: 90 }, nowMinutes: 0, days: 1 });
    expect(items.map((i) => i.time)).toEqual(['08:30', '10:00', '11:30']);
  });

  it('ids are unique', () => {
    const items = buildWaterReminders(base);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});

describe('validation', () => {
  it('accepts the defaults', () => {
    expect(validateWaterReminders(on)).toBeNull();
  });
  it.each([
    [{ ...on, start: '25:00' }],
    [{ ...on, end: 'soon' }],
    [{ ...on, start: '21:00', end: '09:00' }],
    [{ ...on, start: '09:00', end: '09:00' }],
    [{ ...on, intervalMin: 10 }],
    [{ ...on, intervalMin: 600 }],
    [{ ...on, intervalMin: 90.5 }],
  ])('rejects %j', (s) => {
    expect(validateWaterReminders(s as WaterReminderSettings)).not.toBeNull();
  });
  it('invalid settings produce no reminders rather than a crash', () => {
    expect(buildWaterReminders({ ...base, settings: { ...on, start: '21:00', end: '09:00' } })).toEqual([]);
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
const NOW = new Date(2026, 9, 10, 10, 0); // 10 Oct 2026, 10:00

describe('stored settings and syncing', () => {
  async function setup() {
    const db = memoryDb();
    await migrate(db);
    return { repos: new Repos(db), notifier: new FakeNotifier() };
  }

  it('is off until the user switches it on', async () => {
    const { repos, notifier } = await setup();
    expect((await repos.waterReminderSettings()).enabled).toBe(false);
    await syncReminders(repos, notifier, NOW);
    expect(notifier.last).toEqual([]);
  });

  it('saves and reads back, and rejects bad values without changing anything', async () => {
    const { repos } = await setup();
    await repos.setWaterReminderSettings({ enabled: true, start: '08:00', end: '20:00', intervalMin: 90, stopAtTarget: false });
    expect(await repos.waterReminderSettings()).toEqual({ enabled: true, start: '08:00', end: '20:00', intervalMin: 90, stopAtTarget: false });
    await expect(repos.setWaterReminderSettings({ enabled: true, start: '20:00', end: '08:00', intervalMin: 90, stopAtTarget: false })).rejects.toThrow(/later than/);
    expect((await repos.waterReminderSettings()).start).toBe('08:00');
  });

  it('adds water reminders next to money reminders, sorted by time', async () => {
    const { repos, notifier } = await setup();
    await repos.setSalary(10, 5000000);
    await repos.setWaterReminderSettings({ ...on, enabled: true });
    await syncReminders(repos, notifier, NOW);
    const kinds = new Set(notifier.last.map((i) => i.channel ?? 'money'));
    expect(kinds).toEqual(new Set(['money', 'water']));
    const keys = notifier.last.map((i) => i.date + i.time);
    expect([...keys].sort()).toEqual(keys);
  });

  it('adding water up to the target removes the rest of today on the next sync', async () => {
    const { repos, notifier } = await setup();
    await repos.setWaterReminderSettings({ ...on, enabled: true });
    await syncReminders(repos, notifier, NOW);
    expect(notifier.last.filter((i) => i.date === '2026-10-10')).toHaveLength(6); // 11:00 .. 21:00
    await repos.addWater(1000, NOW);
    await repos.addWater(1000, NOW);
    await repos.addWater(1000, NOW);
    await syncReminders(repos, notifier, NOW);
    expect(notifier.last.filter((i) => i.date === '2026-10-10')).toHaveLength(0);
    expect(notifier.last.some((i) => i.date === '2026-10-11')).toBe(true);
  });

  it('the money reminders switch does not turn water reminders off', async () => {
    const { repos, notifier } = await setup();
    await repos.setWaterReminderSettings({ ...on, enabled: true });
    await repos.setReminderSettings(false, '09:00');
    await syncReminders(repos, notifier, NOW);
    expect(notifier.last.length).toBeGreaterThan(0);
    expect(notifier.last.every((i) => i.channel === 'water')).toBe(true);
  });
});
