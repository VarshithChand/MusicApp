import { Db } from './types';

/**
 * The database schema, as numbered migrations. A migration is applied once, in a single transaction, and recorded in
 * schema_migrations. Never edit an applied migration: add a new one.
 *
 * Every record that can come from more than one place keeps a `source` ('manual' now; 'health_connect' later) and,
 * where an outside system supplies ids, an `external_id`, so records from different sources stay distinguishable and
 * duplicates can be rejected by a unique index. There is no server (ADR-007), so there is no sync status column.
 */

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

const DEFAULT_CATEGORIES: [string, number][] = [
  ['Food', 0],
  ['Travel', 0],
  ['Shopping', 0],
  ['Clothing', 0],
  ['Room rent', 1],
  ['EMI', 1],
  ['Loan', 1],
  ['Bills', 1],
  ['Subscriptions', 1],
  ['Other', 0],
];

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'manual tracking: expenses, food, water, day status, budgets, settings',
    statements: [
      `CREATE TABLE settings (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`,
      `CREATE TABLE expense_categories (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL UNIQUE,
         is_fixed INTEGER NOT NULL DEFAULT 0 CHECK (is_fixed IN (0, 1)),
         sort_order INTEGER NOT NULL DEFAULT 0,
         archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
       )`,
      `CREATE TABLE expenses (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         local_date TEXT NOT NULL CHECK (length(local_date) = 10),
         occurred_at TEXT NOT NULL,
         tz_offset_min INTEGER NOT NULL,
         amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
         currency TEXT NOT NULL DEFAULT 'INR',
         category_id INTEGER NOT NULL REFERENCES expense_categories(id),
         note TEXT,
         source TEXT NOT NULL DEFAULT 'manual',
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      `CREATE INDEX idx_expenses_date ON expenses(local_date)`,
      `CREATE TABLE food_entries (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         local_date TEXT NOT NULL CHECK (length(local_date) = 10),
         occurred_at TEXT NOT NULL,
         tz_offset_min INTEGER NOT NULL,
         meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack','tea_coffee','fruit','fast_food','other')),
         name TEXT NOT NULL CHECK (length(trim(name)) > 0),
         quantity TEXT,
         calories INTEGER CHECK (calories IS NULL OR calories >= 0),
         protein_g REAL CHECK (protein_g IS NULL OR protein_g >= 0),
         carbs_g REAL CHECK (carbs_g IS NULL OR carbs_g >= 0),
         fat_g REAL CHECK (fat_g IS NULL OR fat_g >= 0),
         sugar_g REAL CHECK (sugar_g IS NULL OR sugar_g >= 0),
         cost_minor INTEGER CHECK (cost_minor IS NULL OR cost_minor >= 0),
         place TEXT CHECK (place IS NULL OR place IN ('home','restaurant','outside')),
         note TEXT,
         source TEXT NOT NULL DEFAULT 'manual',
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      `CREATE INDEX idx_food_date ON food_entries(local_date)`,
      `CREATE TABLE water_entries (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         local_date TEXT NOT NULL CHECK (length(local_date) = 10),
         occurred_at TEXT NOT NULL,
         tz_offset_min INTEGER NOT NULL,
         amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
         source TEXT NOT NULL DEFAULT 'manual',
         external_id TEXT,
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX idx_water_date ON water_entries(local_date)`,
      // A record that arrives from another source (Health Connect) is identified by its source + external id; the same one can not be stored twice.
      `CREATE UNIQUE INDEX idx_water_external ON water_entries(source, external_id) WHERE external_id IS NOT NULL`,
      `CREATE TABLE day_status (
         local_date TEXT PRIMARY KEY CHECK (length(local_date) = 10),
         spending_complete INTEGER NOT NULL DEFAULT 0 CHECK (spending_complete IN (0, 1)),
         note TEXT,
         updated_at TEXT NOT NULL
       )`,
      `CREATE TABLE budgets (
         month TEXT PRIMARY KEY CHECK (length(month) = 7),
         amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
         updated_at TEXT NOT NULL
       )`,
      ...DEFAULT_CATEGORIES.map(
        ([name, fixed], i) => `INSERT INTO expense_categories (name, is_fixed, sort_order) VALUES ('${name}', ${fixed}, ${i})`,
      ),
      `INSERT INTO settings (key, value) VALUES ('water_target_ml', '3000')`,
    ],
  },
  {
    version: 2,
    name: 'salary, loans (EMIs), savings, reminder settings',
    statements: [
      // One salary row at most (id is always 1).
      `CREATE TABLE salary (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         pay_day INTEGER NOT NULL CHECK (pay_day BETWEEN 1 AND 31),
         amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor > 0),
         updated_at TEXT NOT NULL
       )`,
      // A loan is described once: the EMI, the day it is deducted, the first instalment's month and the tenure.
      // Everything else (paid, remaining, next date, end date) is calculated from these, so nothing can drift.
      `CREATE TABLE loans (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL CHECK (length(trim(name)) > 0),
         emi_minor INTEGER NOT NULL CHECK (emi_minor > 0),
         deduction_day INTEGER NOT NULL CHECK (deduction_day BETWEEN 1 AND 31),
         start_month TEXT NOT NULL CHECK (length(start_month) = 7),
         tenure_months INTEGER NOT NULL CHECK (tenure_months BETWEEN 1 AND 600),
         remind_days_before INTEGER NOT NULL DEFAULT 1 CHECK (remind_days_before BETWEEN 0 AND 7),
         active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
         note TEXT,
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
      `CREATE TABLE savings_entries (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         local_date TEXT NOT NULL CHECK (length(local_date) = 10),
         occurred_at TEXT NOT NULL,
         tz_offset_min INTEGER NOT NULL,
         amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
         note TEXT,
         source TEXT NOT NULL DEFAULT 'manual',
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX idx_savings_date ON savings_entries(local_date)`,
      `INSERT INTO settings (key, value) VALUES ('reminders_enabled', '1')`,
      `INSERT INTO settings (key, value) VALUES ('reminder_time', '09:00')`,
    ],
  },
];

/** Applies every migration that has not been applied yet. Safe to call on every start. */
export async function migrate(db: Db, now: () => string = () => new Date().toISOString(), migrations: Migration[] = MIGRATIONS): Promise<number> {
  await db.executeScript([
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`,
  ]);
  const rows = await db.query<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  const current = rows[0]?.v ?? 0;
  let applied = 0;
  for (const m of migrations) {
    if (m.version <= current) {
      continue;
    }
    const name = m.name.replace(/'/g, "''");
    await db.executeScript([...m.statements, `INSERT INTO schema_migrations (version, name, applied_at) VALUES (${m.version}, '${name}', '${now()}')`]);
    applied++;
  }
  return applied;
}
