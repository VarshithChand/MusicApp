import { formatInr } from '../lib/money';
import { CategoryShare, MonthSummary } from './spending';
import { Fact } from './types';

/**
 * Insight sentences. No AI or LLM (ADR-006): every sentence is a fixed template filled with numbers that the
 * analytics engine already calculated, and a sentence is only produced when its number exists. Results that are
 * estimated or low-confidence say so in the sentence. Correlation is never described as causation.
 */

export interface InsightInput {
  summary: MonthSummary;
  breakdown: CategoryShare[];
  foodChange: Fact<number>;
  waterGoalDays: Fact<number>;
}

const confWords = (f: Fact<number>) => (f.confidence === 'HIGH' || f.confidence === 'NONE' ? '' : ` (${f.confidence.toLowerCase()} confidence: based on the days you recorded)`);

export function buildInsights(i: InsightInput): string[] {
  const out: string[] = [];
  const { summary: s } = i;

  const top = i.breakdown[0];
  if (top && s.totalMinor > 0) {
    out.push(`${top.category} is your highest spending category this month (${top.percent}% of ${formatInr(s.totalMinor)}).`);
  }

  if (i.foodChange.value !== null) {
    const v = i.foodChange.value;
    if (v === 0) {
      out.push(`Food spending is the same as last month${confWords(i.foodChange)}.`);
    } else {
      out.push(`Food spending is ${Math.abs(v)}% ${v > 0 ? 'higher' : 'lower'} than last month${confWords(i.foodChange)}.`);
    }
  }

  if (s.average.value !== null) {
    out.push(`Your average spending on recorded days is ${formatInr(s.average.value)}${s.average.estimated ? ' (estimate: some days were not recorded)' : ''}.`);
  }

  if (s.budget) {
    if (s.budget.utilizationPercent >= 100) {
      out.push(`You have used ${s.budget.utilizationPercent}% of this month's budget.`);
    } else if (s.projection.value !== null && s.projection.value > s.budget.budgetMinor) {
      out.push(`At this pace you may spend about ${formatInr(s.projection.value)} this month, above your budget of ${formatInr(s.budget.budgetMinor)} (estimate).`);
    } else {
      out.push(`${formatInr(s.budget.remainingMinor)} of this month's budget is left (${s.budget.utilizationPercent}% used).`);
    }
  }

  if (i.waterGoalDays.value !== null) {
    out.push(`You met your water target on ${i.waterGoalDays.value} of the last 7 days${i.waterGoalDays.estimated ? ' (some days have no water recorded)' : ''}.`);
  }

  if (out.length === 0) {
    out.push('Add a few days of entries to see insights here.');
  }
  return out;
}
