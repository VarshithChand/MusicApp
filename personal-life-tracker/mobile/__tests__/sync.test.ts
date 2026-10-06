/** @jest-environment node */
import { DatabaseSync } from 'node:sqlite';
import { ReminderItem } from '../src/analytics/reminders';
import { migrate } from '../src/db/migrations';
import { Repos } from '../src/db/repos';
import { Db } from '../src/db/types';
import { Notifier, syncReminders } from '../src/notify/sync';

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
  calls: ReminderItem[][] = [];
  async setSchedule(items: ReminderItem[]) {
    this.calls.push(items);
    return items.length;
  }
  async status() {
    return { enabled: true };
  }
  async requestPermission() {
    return true;
  }
}

async function setup() {
  const db = memoryDb();
  await migrate(db);
  return { repos: new Repos(db), notifier: new FakeNotifier() };
}

const NOW = new Date(2026, 9, 10, 8, 0); // 10 Oct 2026, 8:00 am on the phone

describe('syncing reminders to the phone', () => {
  it('sends nothing to schedule when there is no salary or loan', async () => {
    const { repos, notifier } = await setup();
    expect(await syncReminders(repos, notifier, NOW)).toBe(0);
    expect(notifier.calls).toEqual([[]]);
  });

  it('sends the EMI and salary reminders, with the loan text, in date order', async () => {
    const { repos, notifier } = await setup();
    await repos.setSalary(28, 5000000);
    await repos.setSavingsTargetMinor(500000);
    await repos.addLoan({ name: 'Bike loan', emiMinor: 250000, deductionDay: 5, tenureMonths: 24, paidCount: 3, today: '2026-10-10' });
    await syncReminders(repos, notifier, NOW);
    const sent = notifier.calls[0];
    expect(sent[0]).toMatchObject({ id: 'salary-2026-10-28', time: '09:00', title: 'Salary day' });
    expect(sent[0].text).toContain('Set aside ₹5,000 for savings');
    expect(sent[1]).toMatchObject({ id: 'loan-1-4', date: '2026-11-04', title: 'EMI due tomorrow: Bike loan' });
    expect(sent.map((s) => s.date)).toEqual([...sent.map((s) => s.date)].sort());
  });

  it('replaces the whole list each time, so a deleted loan disappears from the schedule', async () => {
    const { repos, notifier } = await setup();
    const id = await repos.addLoan({ name: 'L', emiMinor: 100, deductionDay: 5, tenureMonths: 12, paidCount: 0, today: '2026-10-10' });
    await syncReminders(repos, notifier, NOW);
    expect(notifier.calls[0].length).toBeGreaterThan(0);
    await repos.deleteLoan(id);
    await syncReminders(repos, notifier, NOW);
    expect(notifier.calls[1]).toEqual([]);
  });

  it('clears the schedule when reminders are switched off, and uses the chosen time', async () => {
    const { repos, notifier } = await setup();
    await repos.setSalary(28, null);
    await repos.setReminderSettings(true, '07:30');
    await syncReminders(repos, notifier, NOW);
    expect(notifier.calls[0][0].time).toBe('07:30');
    await repos.setReminderSettings(false, '07:30');
    await syncReminders(repos, notifier, NOW);
    expect(notifier.calls[1]).toEqual([]);
  });

  it('a reminder time that has already passed today is not scheduled in the past', async () => {
    const { repos, notifier } = await setup();
    await repos.setSalary(10, null); // pay day is today
    await repos.setReminderSettings(true, '07:00'); // 7:00 is before "now" (8:00)
    await syncReminders(repos, notifier, NOW);
    expect(notifier.calls[0][0].date).toBe('2026-11-10'); // next month's
    await repos.setReminderSettings(true, '09:00');
    await syncReminders(repos, notifier, NOW);
    expect(notifier.calls[1][0].date).toBe('2026-10-10'); // later today
  });
});
