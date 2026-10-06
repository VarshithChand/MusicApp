import { addDays, addMonths, dateInMonth, monthOf } from '../lib/dates';
import { formatInr } from '../lib/money';
import { installmentDate, LoanRow, loanStatus, SalaryRow } from './plan';

/**
 * Builds the list of notifications to schedule on the phone: one per upcoming EMI (a chosen number of days before the
 * deduction) and one per salary day, for the next few months. The text is made here, from the loan data, so the phone
 * only has to show it at the right time. The whole list is replaced whenever the data changes or the app is opened.
 */

export interface ReminderItem {
  id: string;
  date: string; // YYYY-MM-DD, phone local date
  time: string; // HH:MM, 24 hour
  title: string;
  text: string;
}

export interface ReminderInput {
  enabled: boolean;
  /** "HH:MM" 24-hour; anything else falls back to 09:00. */
  time: string;
  today: string;
  /** Minutes since midnight now (phone local time), so a reminder earlier today is not scheduled in the past. */
  nowMinutes: number;
  salary: SalaryRow | null;
  savingsTargetMinor: number | null;
  loans: LoanRow[];
  horizonMonths?: number;
}

export function parseReminderTime(text: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) {
    return null;
  }
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

const pad = (n: number) => String(n).padStart(2, '0');

function when(daysBefore: number): string {
  return daysBefore <= 0 ? 'today' : daysBefore === 1 ? 'tomorrow' : `in ${daysBefore} days`;
}

export function buildReminders(input: ReminderInput): ReminderItem[] {
  if (!input.enabled) {
    return [];
  }
  const t = parseReminderTime(input.time) ?? { hour: 9, minute: 0 };
  const time = `${pad(t.hour)}:${pad(t.minute)}`;
  const minutes = t.hour * 60 + t.minute;
  const horizon = input.horizonMonths ?? 12;
  const isFuture = (date: string) => date > input.today || (date === input.today && minutes > input.nowMinutes);
  const out: ReminderItem[] = [];
  const startMonth = monthOf(input.today);
  const lastMonth = addMonths(startMonth, horizon);

  if (input.salary) {
    for (let i = 0; i <= horizon; i++) {
      const date = dateInMonth(addMonths(startMonth, i), input.salary.payDay);
      if (!isFuture(date)) {
        continue;
      }
      const amount = input.salary.amountMinor ? ` (${formatInr(input.salary.amountMinor)})` : '';
      const save = input.savingsTargetMinor ? ` Set aside ${formatInr(input.savingsTargetMinor)} for savings.` : '';
      out.push({ id: `salary-${date}`, date, time, title: 'Salary day', text: `Salary is expected today${amount}.${save}` });
    }
  }

  for (const loan of input.loans) {
    if (!loan.active) {
      continue;
    }
    const s = loanStatus(loan, input.today);
    if (s.finished || s.nextInstallment === null) {
      continue;
    }
    for (let k = s.nextInstallment; k <= loan.tenureMonths; k++) {
      const due = installmentDate(loan, k);
      if (due > dateInMonth(lastMonth, 31)) {
        break;
      }
      const remindOn = addDays(due, -loan.remindDaysBefore);
      if (!isFuture(remindOn)) {
        continue;
      }
      const left = loan.tenureMonths - k;
      out.push({
        id: `loan-${loan.id}-${k}`,
        date: remindOn,
        time,
        title: `EMI due ${when(loan.remindDaysBefore)}: ${loan.name}`,
        text: `${formatInr(loan.emiMinor)} on ${due} · instalment ${k} of ${loan.tenureMonths} · ${left === 0 ? 'this is the last instalment' : `${left} left after this`}`,
      });
    }
  }

  return out.sort((a, b) => (a.date + a.time + a.id).localeCompare(b.date + b.time + b.id));
}
