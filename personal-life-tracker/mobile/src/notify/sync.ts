import { buildReminders, ReminderItem } from '../analytics/reminders';
import { Repos } from '../db/repos';
import { toLocalDateString } from '../lib/dates';

/** What the app needs from the phone's notification system. The real one is the Kotlin module; tests use a fake. */
export interface Notifier {
  /** Replaces the whole schedule. Resolves with how many reminders are set for the future. */
  setSchedule(items: ReminderItem[]): Promise<number>;
  status(): Promise<{ enabled: boolean }>;
  requestPermission(): Promise<boolean>;
}

/**
 * Works out the reminders from the stored salary, loans and savings target and hands the whole list to the phone.
 * Called when the app opens, when the day changes and after any change, so the schedule always matches the data.
 */
export async function syncReminders(repos: Repos, notifier: Notifier, now: Date = new Date()): Promise<number> {
  const settings = await repos.reminderSettings();
  const items = buildReminders({
    ...settings,
    today: toLocalDateString(now),
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
    salary: await repos.getSalary(),
    savingsTargetMinor: await repos.savingsTargetMinor(),
    loans: await repos.loans(),
  });
  return notifier.setSchedule(items);
}
