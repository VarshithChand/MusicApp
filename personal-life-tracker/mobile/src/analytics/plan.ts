import { addDays, addMonths, dateInMonth, diffDays, monthOf, monthsBetween } from '../lib/dates';

/**
 * Salary, loans (EMIs) and savings. Pure functions, tested. Loan arithmetic is by instalment count only: the app does
 * not know interest or principal, so "remaining" means remaining instalments x the EMI, not the loan's outstanding balance.
 */

export interface LoanRow {
  id: number;
  name: string;
  emiMinor: number;
  deductionDay: number; // 1-31; a day the month lacks means the last day of that month
  startMonth: string; // the month of instalment 1 (YYYY-MM)
  tenureMonths: number;
  remindDaysBefore: number;
  active: boolean;
}

export interface SalaryRow {
  payDay: number; // 1-31
  amountMinor: number | null;
}

/** Date of instalment k (1-based). */
export function installmentDate(loan: LoanRow, k: number): string {
  if (!Number.isInteger(k) || k < 1 || k > loan.tenureMonths) {
    throw new Error(`Instalment ${k} is outside 1..${loan.tenureMonths}`);
  }
  return dateInMonth(addMonths(loan.startMonth, k - 1), loan.deductionDay);
}

export interface LoanStatus {
  paid: number; // instalments whose date is before today
  remaining: number; // including one due today
  finished: boolean;
  nextInstallment: number | null;
  nextDate: string | null;
  daysToNext: number | null;
  endDate: string; // date of the last instalment
  remainingMinor: number; // remaining instalments x EMI
}

export function loanStatus(loan: LoanRow, today: string): LoanStatus {
  let paid = 0;
  for (let k = 1; k <= loan.tenureMonths; k++) {
    if (installmentDate(loan, k) < today) {
      paid++;
    } else {
      break; // dates only increase, so the rest are not paid yet
    }
  }
  const remaining = loan.tenureMonths - paid;
  const finished = remaining === 0;
  const nextInstallment = finished ? null : paid + 1;
  const nextDate = nextInstallment ? installmentDate(loan, nextInstallment) : null;
  return {
    paid,
    remaining,
    finished,
    nextInstallment,
    nextDate,
    daysToNext: nextDate ? diffDays(today, nextDate) : null,
    endDate: installmentDate(loan, loan.tenureMonths),
    remainingMinor: remaining * loan.emiMinor,
  };
}

/**
 * The first-instalment month to store when the user says "I have already paid N EMIs".
 * An instalment counts as paid once its date has passed (before today).
 */
export function startMonthFor(deductionDay: number, paidCount: number, today: string): string {
  const thisMonth = monthOf(today);
  const datePassedThisMonth = dateInMonth(thisMonth, deductionDay) < today;
  if (paidCount <= 0) {
    return datePassedThisMonth ? addMonths(thisMonth, 1) : thisMonth;
  }
  const lastPaidMonth = datePassedThisMonth ? thisMonth : addMonths(thisMonth, -1);
  return addMonths(lastPaidMonth, -(paidCount - 1));
}

/** Instalments that fall in a month, across the active loans. */
export function monthObligations(loans: LoanRow[], month: string): { loan: LoanRow; k: number; date: string }[] {
  const out: { loan: LoanRow; k: number; date: string }[] = [];
  for (const loan of loans) {
    if (!loan.active) {
      continue;
    }
    const k = monthsBetween(loan.startMonth, month) + 1;
    if (k >= 1 && k <= loan.tenureMonths) {
      out.push({ loan, k, date: installmentDate(loan, k) });
    }
  }
  return out;
}

export function monthEmiTotal(loans: LoanRow[], month: string): number {
  return monthObligations(loans, month).reduce((s, o) => s + o.loan.emiMinor, 0);
}

/** The next salary date on or after `today`. */
export function nextSalaryDate(salary: SalaryRow, today: string): string {
  const thisMonth = monthOf(today);
  const d = dateInMonth(thisMonth, salary.payDay);
  return d >= today ? d : dateInMonth(addMonths(thisMonth, 1), salary.payDay);
}

export interface MonthPlan {
  incomeMinor: number | null;
  emiMinor: number;
  otherSpendingMinor: number;
  /** Salary minus EMIs minus other spending. Null if no salary amount was entered. */
  leftMinor: number | null;
  /** True when some days of spending are unrecorded, so the real figure may be lower. */
  estimated: boolean;
  savedMinor: number;
  targetMinor: number | null;
  targetPercent: number | null;
}

/**
 * Where the month stands. Spending in the categories named in `emiCategories` is left out of `otherSpendingMinor`
 * because the EMIs are already counted from the loans, so an EMI you also typed in as an expense is not counted twice.
 */
export function monthPlan(input: {
  salary: SalaryRow | null;
  loans: LoanRow[];
  month: string;
  spendingByCategory: { category: string; totalMinor: number }[];
  emiCategories?: string[];
  spendingEstimated: boolean;
  savedMinor: number;
  targetMinor: number | null;
}): MonthPlan {
  const emiCats = (input.emiCategories ?? ['EMI', 'Loan']).map((c) => c.toLowerCase());
  const other = input.spendingByCategory.filter((c) => !emiCats.includes(c.category.toLowerCase())).reduce((s, c) => s + c.totalMinor, 0);
  const emi = monthEmiTotal(input.loans, input.month);
  const income = input.salary?.amountMinor ?? null;
  return {
    incomeMinor: income,
    emiMinor: emi,
    otherSpendingMinor: other,
    leftMinor: income === null ? null : income - emi - other,
    estimated: input.spendingEstimated,
    savedMinor: input.savedMinor,
    targetMinor: input.targetMinor,
    targetPercent: input.targetMinor && input.targetMinor > 0 ? Math.round((input.savedMinor / input.targetMinor) * 1000) / 10 : null,
  };
}

export { addDays };
