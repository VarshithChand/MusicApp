import { buildReminders, ReminderItem } from '../analytics/reminders';
import { buildMealReminders } from '../analytics/mealReminders';
import { buildWaterReminders } from '../analytics/waterReminders';
import { waterForDay } from '../analytics/wellness';
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
  const today = toLocalDateString(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const money = buildReminders({
    ...settings,
    today,
    nowMinutes,
    salary: await repos.getSalary(),
    savingsTargetMinor: await repos.savingsTargetMinor(),
    loans: await repos.loans(),
  });
  const water = buildWaterReminders({
    settings: await repos.waterReminderSettings(),
    today,
    nowMinutes,
    todayMl: waterForDay(await repos.waterBetween(today, today), today),
    targetMl: await repos.waterTargetMl(),
  });
  const loggedToday = (await repos.foodBetween(today, today)).map((f) => f.mealType);
  const food = buildMealReminders({ settings: await repos.mealReminderSettings(), today, nowMinutes, loggedToday });
  const items = [...money, ...water, ...food].sort((x, y) => (x.date + x.time + x.id).localeCompare(y.date + y.time + y.id));
  return notifier.setSchedule(items);
}
