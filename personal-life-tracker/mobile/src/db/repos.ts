import { isValidDate, isValidMonth, toLocalDateString, tzOffsetMinutes } from '../lib/dates';
import { LoanRow, SalaryRow, startMonthFor } from '../analytics/plan';
import { parseReminderTime } from '../analytics/reminders';
import { CardId, parseCards, serializeCards } from '../analytics/dashboard';
import { DEFAULT_MEAL_REMINDERS, DEFAULT_MEAL_SLOTS, MealReminderSettings, MealSlot, validateMealSlots } from '../analytics/mealReminders';
import { DEFAULT_WATER_REMINDERS, validateWaterReminders, WaterReminderSettings } from '../analytics/waterReminders';
import { DayRow, ExpenseRow, FoodRow, Place, WaterRow } from '../analytics/types';
import { Db } from './types';

/**
 * All reads and writes of the app's data. Every write is validated here as well as by the database's own CHECK
 * constraints, and gives the user a clear error instead of a raw SQL failure.
 */

export interface Category {
  id: number;
  name: string;
  isFixed: boolean;
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'tea_coffee', 'fruit', 'fast_food', 'other'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

const stamp = (now: Date) => ({ iso: now.toISOString(), localDate: toLocalDateString(now), tz: tzOffsetMinutes(now) });

export class Repos {
  constructor(private readonly db: Db) {}

  // ------------------------------------------------------------ settings
  async getSetting(key: string): Promise<string | null> {
    const r = await this.db.query<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return r[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  async waterTargetMl(): Promise<number> {
    const v = Number(await this.getSetting('water_target_ml'));
    return Number.isFinite(v) && v > 0 ? v : 3000;
  }

  async setWaterTargetMl(ml: number): Promise<void> {
    if (!Number.isInteger(ml) || ml < 500 || ml > 10000) {
      throw new Error('The water target must be between 500 and 10,000 ml.');
    }
    await this.setSetting('water_target_ml', String(ml));
  }

  // ------------------------------------------------------------ budgets
  async getBudget(month: string): Promise<number | null> {
    const r = await this.db.query<{ amount_minor: number }>('SELECT amount_minor FROM budgets WHERE month = ?', [month]);
    return r[0]?.amount_minor ?? null;
  }

  async setBudget(month: string, amountMinor: number, now = new Date()): Promise<void> {
    if (!isValidMonth(month)) {
      throw new Error('Invalid month.');
    }
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error('The budget must be a positive amount.');
    }
    await this.db.execute(
      'INSERT INTO budgets (month, amount_minor, updated_at) VALUES (?, ?, ?) ON CONFLICT(month) DO UPDATE SET amount_minor = excluded.amount_minor, updated_at = excluded.updated_at',
      [month, amountMinor, now.toISOString()],
    );
  }

  // ------------------------------------------------------------ expenses
  async categories(): Promise<Category[]> {
    const r = await this.db.query<{ id: number; name: string; is_fixed: number }>(
      'SELECT id, name, is_fixed FROM expense_categories WHERE archived = 0 ORDER BY sort_order, name',
    );
    return r.map((c) => ({ id: c.id, name: c.name, isFixed: c.is_fixed === 1 }));
  }

  async addExpense(input: { amountMinor: number; categoryId: number; note?: string; now?: Date }): Promise<number> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('Enter an amount greater than zero.');
    }
    const s = stamp(input.now ?? new Date());
    return this.db.execute(
      `INSERT INTO expenses (local_date, occurred_at, tz_offset_min, amount_minor, category_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.localDate, s.iso, s.tz, input.amountMinor, input.categoryId, input.note?.trim() || null, s.iso, s.iso],
    );
  }

  async deleteExpense(id: number): Promise<void> {
    await this.db.execute('DELETE FROM expenses WHERE id = ?', [id]);
  }

  /** Expenses with their category, for analytics and lists. `from` and `to` are local dates, both included. */
  async expensesBetween(from: string, to: string): Promise<(ExpenseRow & { note: string | null })[]> {
    const r = await this.db.query<{ id: number; local_date: string; amount_minor: number; name: string; is_fixed: number; note: string | null }>(
      `SELECT e.id, e.local_date, e.amount_minor, c.name, c.is_fixed, e.note
         FROM expenses e JOIN expense_categories c ON c.id = e.category_id
        WHERE e.local_date BETWEEN ? AND ?
        ORDER BY e.local_date DESC, e.id DESC`,
      [from, to],
    );
    return r.map((x) => ({ id: x.id, localDate: x.local_date, amountMinor: x.amount_minor, category: x.name, fixed: x.is_fixed === 1, note: x.note }));
  }

  // ------------------------------------------------------------ day status ("I recorded everything")
  async setSpendingComplete(date: string, complete: boolean, now = new Date()): Promise<void> {
    if (!isValidDate(date)) {
      throw new Error('Invalid date.');
    }
    await this.db.execute(
      'INSERT INTO day_status (local_date, spending_complete, updated_at) VALUES (?, ?, ?) ON CONFLICT(local_date) DO UPDATE SET spending_complete = excluded.spending_complete, updated_at = excluded.updated_at',
      [date, complete ? 1 : 0, now.toISOString()],
    );
  }

  async dayStatusBetween(from: string, to: string): Promise<DayRow[]> {
    const r = await this.db.query<{ local_date: string; spending_complete: number }>(
      'SELECT local_date, spending_complete FROM day_status WHERE local_date BETWEEN ? AND ?',
      [from, to],
    );
    return r.map((d) => ({ localDate: d.local_date, spendingComplete: d.spending_complete === 1 }));
  }

  // ------------------------------------------------------------ water
  async addWater(ml: number, now = new Date()): Promise<number> {
    if (!Number.isInteger(ml) || ml <= 0 || ml > 5000) {
      throw new Error('Water must be between 1 and 5000 ml in one entry.');
    }
    const s = stamp(now);
    return this.db.execute('INSERT INTO water_entries (local_date, occurred_at, tz_offset_min, amount_ml, created_at) VALUES (?, ?, ?, ?, ?)', [
      s.localDate,
      s.iso,
      s.tz,
      ml,
      s.iso,
    ]);
  }

  async deleteWater(id: number): Promise<void> {
    await this.db.execute('DELETE FROM water_entries WHERE id = ?', [id]);
  }

  async waterBetween(from: string, to: string): Promise<WaterRow[]> {
    const r = await this.db.query<{ id: number; local_date: string; amount_ml: number }>(
      'SELECT id, local_date, amount_ml FROM water_entries WHERE local_date BETWEEN ? AND ? ORDER BY id',
      [from, to],
    );
    return r.map((w) => ({ id: w.id, localDate: w.local_date, ml: w.amount_ml }));
  }

  // ------------------------------------------------------------ food
  async addFood(input: {
    mealType: MealType;
    name: string;
    calories?: number | null;
    proteinG?: number | null;
    costMinor?: number | null;
    place?: Place | null;
    note?: string;
    now?: Date;
  }): Promise<number> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Enter what you ate.');
    }
    if (!MEAL_TYPES.includes(input.mealType)) {
      throw new Error('Unknown meal type.');
    }
    const nonNeg = (v: number | null | undefined, label: string) => {
      if (v !== null && v !== undefined && (!Number.isFinite(v) || v < 0)) {
        throw new Error(`${label} can not be negative.`);
      }
    };
    nonNeg(input.calories, 'Calories');
    nonNeg(input.proteinG, 'Protein');
    nonNeg(input.costMinor, 'Cost');
    const s = stamp(input.now ?? new Date());
    return this.db.execute(
      `INSERT INTO food_entries (local_date, occurred_at, tz_offset_min, meal_type, name, calories, protein_g, cost_minor, place, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.localDate, s.iso, s.tz, input.mealType, name, input.calories ?? null, input.proteinG ?? null, input.costMinor ?? null, input.place ?? null, input.note?.trim() || null, s.iso, s.iso],
    );
  }

  async deleteFood(id: number): Promise<void> {
    await this.db.execute('DELETE FROM food_entries WHERE id = ?', [id]);
  }

  async foodBetween(from: string, to: string): Promise<(FoodRow & { id: number })[]> {
    const r = await this.db.query<{
      id: number;
      local_date: string;
      meal_type: string;
      name: string;
      calories: number | null;
      protein_g: number | null;
      cost_minor: number | null;
      place: Place | null;
    }>('SELECT id, local_date, meal_type, name, calories, protein_g, cost_minor, place FROM food_entries WHERE local_date BETWEEN ? AND ? ORDER BY local_date DESC, id DESC', [from, to]);
    return r.map((f) => ({ id: f.id, localDate: f.local_date, mealType: f.meal_type, name: f.name, calories: f.calories, proteinG: f.protein_g, costMinor: f.cost_minor, place: f.place }));
  }

  // ------------------------------------------------------------ salary
  async getSalary(): Promise<SalaryRow | null> {
    const r = await this.db.query<{ pay_day: number; amount_minor: number | null }>('SELECT pay_day, amount_minor FROM salary WHERE id = 1');
    return r[0] ? { payDay: r[0].pay_day, amountMinor: r[0].amount_minor } : null;
  }

  async setSalary(payDay: number, amountMinor: number | null, now = new Date()): Promise<void> {
    if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) {
      throw new Error('The salary day must be a day of the month from 1 to 31.');
    }
    if (amountMinor !== null && (!Number.isInteger(amountMinor) || amountMinor <= 0)) {
      throw new Error('The salary amount must be greater than zero (or leave it empty).');
    }
    await this.db.execute(
      'INSERT INTO salary (id, pay_day, amount_minor, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET pay_day = excluded.pay_day, amount_minor = excluded.amount_minor, updated_at = excluded.updated_at',
      [payDay, amountMinor, now.toISOString()],
    );
  }

  async clearSalary(): Promise<void> {
    await this.db.execute('DELETE FROM salary WHERE id = 1');
  }

  // ------------------------------------------------------------ loans
  async loans(): Promise<LoanRow[]> {
    const r = await this.db.query<{
      id: number;
      name: string;
      emi_minor: number;
      deduction_day: number;
      start_month: string;
      tenure_months: number;
      remind_days_before: number;
      active: number;
    }>('SELECT id, name, emi_minor, deduction_day, start_month, tenure_months, remind_days_before, active FROM loans ORDER BY id');
    return r.map((l) => ({
      id: l.id,
      name: l.name,
      emiMinor: l.emi_minor,
      deductionDay: l.deduction_day,
      startMonth: l.start_month,
      tenureMonths: l.tenure_months,
      remindDaysBefore: l.remind_days_before,
      active: l.active === 1,
    }));
  }

  /**
   * Adds a loan. The user says how many EMIs are already paid (0 for a new loan); the first instalment's month is
   * worked out from that and today's date, so the schedule agrees with what the user told us.
   */
  async addLoan(input: {
    name: string;
    emiMinor: number;
    deductionDay: number;
    tenureMonths: number;
    paidCount: number;
    remindDaysBefore?: number;
    today: string;
    now?: Date;
  }): Promise<number> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('Give the loan a name.');
    }
    if (!Number.isInteger(input.emiMinor) || input.emiMinor <= 0) {
      throw new Error('The EMI must be greater than zero.');
    }
    if (!Number.isInteger(input.deductionDay) || input.deductionDay < 1 || input.deductionDay > 31) {
      throw new Error('The deduction day must be a day of the month from 1 to 31.');
    }
    if (!Number.isInteger(input.tenureMonths) || input.tenureMonths < 1 || input.tenureMonths > 600) {
      throw new Error('The tenure must be between 1 and 600 months.');
    }
    if (!Number.isInteger(input.paidCount) || input.paidCount < 0 || input.paidCount >= input.tenureMonths) {
      throw new Error('EMIs already paid must be 0 or more, and fewer than the tenure (a finished loan does not need tracking).');
    }
    const before = input.remindDaysBefore ?? 1;
    if (!Number.isInteger(before) || before < 0 || before > 7) {
      throw new Error('Reminder days must be from 0 to 7.');
    }
    const iso = (input.now ?? new Date()).toISOString();
    return this.db.execute(
      `INSERT INTO loans (name, emi_minor, deduction_day, start_month, tenure_months, remind_days_before, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, input.emiMinor, input.deductionDay, startMonthFor(input.deductionDay, input.paidCount, input.today), input.tenureMonths, before, iso, iso],
    );
  }

  async deleteLoan(id: number): Promise<void> {
    await this.db.execute('DELETE FROM loans WHERE id = ?', [id]);
  }

  async setLoanActive(id: number, active: boolean): Promise<void> {
    await this.db.execute('UPDATE loans SET active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, new Date().toISOString(), id]);
  }

  // ------------------------------------------------------------ savings
  async savingsTargetMinor(): Promise<number | null> {
    const v = await this.getSetting('savings_target_minor');
    const n = v === null ? NaN : Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  async setSavingsTargetMinor(minor: number | null): Promise<void> {
    if (minor === null) {
      await this.db.execute("DELETE FROM settings WHERE key = 'savings_target_minor'");
      return;
    }
    if (!Number.isInteger(minor) || minor <= 0) {
      throw new Error('The savings target must be greater than zero (or clear it).');
    }
    await this.setSetting('savings_target_minor', String(minor));
  }

  async addSavings(amountMinor: number, now = new Date(), note?: string): Promise<number> {
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      throw new Error('Enter a savings amount greater than zero.');
    }
    const s = stamp(now);
    return this.db.execute(
      'INSERT INTO savings_entries (local_date, occurred_at, tz_offset_min, amount_minor, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [s.localDate, s.iso, s.tz, amountMinor, note?.trim() || null, s.iso],
    );
  }

  async deleteSavings(id: number): Promise<void> {
    await this.db.execute('DELETE FROM savings_entries WHERE id = ?', [id]);
  }

  async savingsBetween(from: string, to: string): Promise<{ id: number; localDate: string; amountMinor: number; note: string | null }[]> {
    const r = await this.db.query<{ id: number; local_date: string; amount_minor: number; note: string | null }>(
      'SELECT id, local_date, amount_minor, note FROM savings_entries WHERE local_date BETWEEN ? AND ? ORDER BY local_date DESC, id DESC',
      [from, to],
    );
    return r.map((x) => ({ id: x.id, localDate: x.local_date, amountMinor: x.amount_minor, note: x.note }));
  }

  // ------------------------------------------------------------ dashboard
  async dashboardCards(): Promise<CardId[]> {
    return parseCards(await this.getSetting('dashboard_cards'));
  }

  async setDashboardCards(cards: CardId[]): Promise<void> {
    await this.setSetting('dashboard_cards', serializeCards(cards));
  }

  // ------------------------------------------------------------ meal-time reminders
  async mealReminderSettings(): Promise<MealReminderSettings> {
    const slots: MealSlot[] = [];
    for (const d of DEFAULT_MEAL_SLOTS) {
      slots.push({
        ...d,
        time: (await this.getSetting(`meal_time_${d.meal}`)) ?? d.time,
        enabled: (await this.getSetting(`meal_on_${d.meal}`)) !== '0',
      });
    }
    const enabled = (await this.getSetting('meal_reminders_enabled')) === '1';
    return validateMealSlots(slots) === null ? { enabled, slots } : { ...DEFAULT_MEAL_REMINDERS, enabled };
  }

  async setMealReminderSettings(s: MealReminderSettings): Promise<void> {
    const problem = validateMealSlots(s.slots);
    if (problem) {
      throw new Error(problem);
    }
    await this.setSetting('meal_reminders_enabled', s.enabled ? '1' : '0');
    for (const slot of s.slots) {
      await this.setSetting(`meal_time_${slot.meal}`, slot.time.trim());
      await this.setSetting(`meal_on_${slot.meal}`, slot.enabled ? '1' : '0');
    }
  }

  // ------------------------------------------------------------ water reminder settings
  async waterReminderSettings(): Promise<WaterReminderSettings> {
    const d = DEFAULT_WATER_REMINDERS;
    const interval = Number(await this.getSetting('water_reminder_interval_min'));
    const s: WaterReminderSettings = {
      enabled: (await this.getSetting('water_reminders_enabled')) === '1',
      start: (await this.getSetting('water_reminder_start')) ?? d.start,
      end: (await this.getSetting('water_reminder_end')) ?? d.end,
      intervalMin: Number.isInteger(interval) && interval > 0 ? interval : d.intervalMin,
      stopAtTarget: (await this.getSetting('water_reminder_stop_at_target')) !== '0',
    };
    return validateWaterReminders(s) === null ? s : { ...d, enabled: s.enabled };
  }

  async setWaterReminderSettings(s: WaterReminderSettings): Promise<void> {
    const problem = validateWaterReminders(s);
    if (problem) {
      throw new Error(problem);
    }
    await this.setSetting('water_reminders_enabled', s.enabled ? '1' : '0');
    await this.setSetting('water_reminder_start', s.start.trim());
    await this.setSetting('water_reminder_end', s.end.trim());
    await this.setSetting('water_reminder_interval_min', String(s.intervalMin));
    await this.setSetting('water_reminder_stop_at_target', s.stopAtTarget ? '1' : '0');
  }

  // ------------------------------------------------------------ reminder settings
  async reminderSettings(): Promise<{ enabled: boolean; time: string }> {
    const enabled = (await this.getSetting('reminders_enabled')) !== '0';
    const time = (await this.getSetting('reminder_time')) ?? '09:00';
    return { enabled, time: parseReminderTime(time) ? time : '09:00' };
  }

  async setReminderSettings(enabled: boolean, time: string): Promise<void> {
    if (!parseReminderTime(time)) {
      throw new Error('Enter the reminder time as hours and minutes, like 09:00.');
    }
    await this.setSetting('reminders_enabled', enabled ? '1' : '0');
    await this.setSetting('reminder_time', time.trim());
  }
}
