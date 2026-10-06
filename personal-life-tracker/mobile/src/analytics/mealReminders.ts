import { addDays } from '../lib/dates';
import { ReminderItem, parseReminderTime } from './reminders';

/**
 * Meal-time reminders. The owner sets a time for each meal (breakfast, lunch, snack, dinner) and switches each one on or
 * off; the phone then shows "Time for lunch" at that time. Like the water reminders, the list covers today and the next
 * two days and is rebuilt whenever the app opens or something is saved, so a meal already recorded today does not remind
 * again.
 */

export type MealSlotId = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface MealSlot {
  meal: MealSlotId;
  label: string;
  /** "HH:MM", 24 hour */
  time: string;
  enabled: boolean;
}

export interface MealReminderSettings {
  /** Master switch. Off until the owner turns it on. */
  enabled: boolean;
  slots: MealSlot[];
}

export const DEFAULT_MEAL_SLOTS: MealSlot[] = [
  { meal: 'breakfast', label: 'Breakfast', time: '08:30', enabled: true },
  { meal: 'lunch', label: 'Lunch', time: '13:00', enabled: true },
  { meal: 'snack', label: 'Snack', time: '17:00', enabled: true },
  { meal: 'dinner', label: 'Dinner', time: '20:00', enabled: true },
];

export const DEFAULT_MEAL_REMINDERS: MealReminderSettings = { enabled: false, slots: DEFAULT_MEAL_SLOTS };

export interface MealReminderInput {
  settings: MealReminderSettings;
  today: string;
  nowMinutes: number;
  /** Meal types already recorded today (a recorded meal is not reminded again today). */
  loggedToday: string[];
  /** Days to schedule including today. Default 3. */
  days?: number;
}

export function validateMealSlots(slots: MealSlot[]): string | null {
  for (const s of slots) {
    if (!parseReminderTime(s.time)) {
      return `Enter the ${s.label.toLowerCase()} time as hours and minutes, like ${s.meal === 'breakfast' ? '08:30' : '13:00'}.`;
    }
  }
  return null;
}

export function buildMealReminders(input: MealReminderInput): ReminderItem[] {
  if (!input.settings.enabled || validateMealSlots(input.settings.slots) !== null) {
    return [];
  }
  const days = input.days ?? 3;
  const out: ReminderItem[] = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(input.today, d);
    for (const slot of input.settings.slots) {
      if (!slot.enabled) {
        continue;
      }
      const t = parseReminderTime(slot.time)!;
      const minutes = t.hour * 60 + t.minute;
      if (d === 0 && (minutes <= input.nowMinutes || input.loggedToday.includes(slot.meal))) {
        continue;
      }
      const time = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
      out.push({
        id: `food-${date}-${slot.meal}`,
        date,
        time,
        title: `Time for ${slot.label.toLowerCase()}`,
        text: 'Add what you ate in the Food tab once you have eaten.',
        channel: 'food',
      });
    }
  }
  return out;
}

/** The next enabled meal time today after `nowMinutes`, for the dashboard. */
export function nextMealToday(settings: MealReminderSettings, nowMinutes: number, loggedToday: string[]): MealSlot | null {
  if (!settings.enabled) {
    return null;
  }
  const upcoming = settings.slots
    .filter((s) => s.enabled && parseReminderTime(s.time) && !loggedToday.includes(s.meal))
    .map((s) => ({ s, m: parseReminderTime(s.time)!.hour * 60 + parseReminderTime(s.time)!.minute }))
    .filter((x) => x.m > nowMinutes)
    .sort((a, b) => a.m - b.m);
  return upcoming[0]?.s ?? null;
}
