import { addDays } from '../lib/dates';
import { ReminderItem, parseReminderTime } from './reminders';

/**
 * "Drink water" reminders: one every `intervalMin` minutes from the start time to the end time, for today and the next
 * couple of days. The app rebuilds the list every time it opens and every time water is added, so:
 *  - reminders for later today disappear as soon as the day's target is reached (if "stop at target" is on), and
 *  - the text shows the amount recorded when the list was last built.
 * Days further ahead are only covered until the app is opened again; the app does not run in the background.
 */

export interface WaterReminderSettings {
  enabled: boolean;
  /** "HH:MM" */
  start: string;
  end: string;
  intervalMin: number;
  /** No more reminders for today once the daily target is reached. */
  stopAtTarget: boolean;
}

export const DEFAULT_WATER_REMINDERS: WaterReminderSettings = { enabled: false, start: '09:00', end: '21:00', intervalMin: 120, stopAtTarget: true };

export const WATER_INTERVALS = [60, 90, 120, 180];

export interface WaterReminderInput {
  settings: WaterReminderSettings;
  today: string;
  nowMinutes: number;
  todayMl: number;
  targetMl: number;
  /** Days to schedule including today. Default 3. */
  days?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const litres = (ml: number) => `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L`;

export function validateWaterReminders(s: WaterReminderSettings): string | null {
  const a = parseReminderTime(s.start);
  const b = parseReminderTime(s.end);
  if (!a || !b) {
    return 'Enter the start and end time as hours and minutes, like 09:00.';
  }
  if (a.hour * 60 + a.minute >= b.hour * 60 + b.minute) {
    return 'The end time must be later than the start time.';
  }
  if (!Number.isInteger(s.intervalMin) || s.intervalMin < 30 || s.intervalMin > 480) {
    return 'The gap between reminders must be from 30 minutes to 8 hours.';
  }
  return null;
}

export function buildWaterReminders(input: WaterReminderInput): ReminderItem[] {
  const s = input.settings;
  if (!s.enabled || validateWaterReminders(s) !== null) {
    return [];
  }
  const a = parseReminderTime(s.start)!;
  const b = parseReminderTime(s.end)!;
  const from = a.hour * 60 + a.minute;
  const to = b.hour * 60 + b.minute;
  const days = input.days ?? 3;
  const met = input.targetMl > 0 && input.todayMl >= input.targetMl;
  const out: ReminderItem[] = [];
  for (let d = 0; d < days; d++) {
    const date = addDays(input.today, d);
    if (d === 0 && s.stopAtTarget && met) {
      continue;
    }
    for (let m = from; m <= to; m += s.intervalMin) {
      if (d === 0 && m <= input.nowMinutes) {
        continue;
      }
      const time = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const text =
        d === 0
          ? input.todayMl > 0
            ? `You have had ${litres(input.todayMl)} of ${litres(input.targetMl)} today.`
            : `Nothing recorded yet today. Target ${litres(input.targetMl)}.`
          : `Today's target is ${litres(input.targetMl)}.`;
      out.push({ id: `water-${date}-${time}`, date, time, title: 'Time for some water', text, channel: 'water' });
    }
  }
  return out;
}
