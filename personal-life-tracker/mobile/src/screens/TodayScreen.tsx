import React, { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ALL_CARDS, CARD_LABELS, CardId, moveCard, toggleCard } from '../analytics/dashboard';
import { buildInsights } from '../analytics/insights';
import { MealSlot, nextMealToday } from '../analytics/mealReminders';
import { loanStatus, nextSalaryDate } from '../analytics/plan';
import { categoryBreakdown, knownDays, monthOverMonthChange, monthSummary, MonthSummary, spendingTotal } from '../analytics/spending';
import { DayRow, Fact, FoodRow, WaterRow } from '../analytics/types';
import { dayNutrition, waterGoalDays, waterGoalProgress } from '../analytics/wellness';
import { Badge, Big, Button, Card, Chip, Heading, Muted, Page, Progress, Row, Title } from '../components/ui';
import { useData } from '../data';
import { addDays, diffDays, monthEnd, monthOf, monthStart, prevMonth } from '../lib/dates';
import { message } from '../lib/errors';
import { formatInr } from '../lib/money';
import { useColors } from '../theme';

interface State {
  cards: CardId[];
  summary: MonthSummary;
  todayMinor: number;
  todayKnown: boolean;
  todayComplete: boolean;
  waterMl: number;
  waterPct: number;
  waterTarget: number;
  waterDays: Fact<number>;
  nutrition: ReturnType<typeof dayNutrition>;
  nextMeal: MealSlot | null;
  insights: string[];
  coming: {
    salary: { date: string; days: number; amountMinor: number | null } | null;
    emis: { name: string; date: string; days: number; amountMinor: number; k: number; total: number }[];
    savedMinor: number;
    targetMinor: number | null;
  } | null;
}

const confidenceText = (f: Fact<number>) => (f.estimated || f.confidence === 'LOW' ? <Badge text={f.estimated ? 'ESTIMATE' : 'LOW'} /> : null);

export function TodayScreen() {
  const { repos, today, version, changed } = useData();
  const c = useColors();
  const [s, setS] = useState<State | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const month = monthOf(today);
    const from = monthStart(prevMonth(month));
    const to = monthEnd(month);
    const [rows, days, budget, water, food, target, salary, loans, savingsTarget, savings, cards, meals] = await Promise.all([
      repos.expensesBetween(from, to),
      repos.dayStatusBetween(from, to),
      repos.getBudget(month),
      repos.waterBetween(addDays(today, -6), today),
      repos.foodBetween(today, today),
      repos.waterTargetMl(),
      repos.getSalary(),
      repos.loans(),
      repos.savingsTargetMinor(),
      repos.savingsBetween(monthStart(month), monthEnd(month)),
      repos.dashboardCards(),
      repos.mealReminderSettings(),
    ]);
    const emis = loans
      .filter((l) => l.active)
      .map((l) => ({ l, s: loanStatus(l, today) }))
      .filter((x) => !x.s.finished && x.s.nextDate !== null)
      .map((x) => ({ name: x.l.name, date: x.s.nextDate as string, days: x.s.daysToNext as number, amountMinor: x.l.emiMinor, k: x.s.nextInstallment as number, total: x.l.tenureMonths }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const nextSalary = salary ? nextSalaryDate(salary, today) : null;
    const coming =
      salary || emis.length || savingsTarget
        ? {
            salary: salary && nextSalary ? { date: nextSalary, days: diffDays(today, nextSalary), amountMinor: salary.amountMinor } : null,
            emis,
            savedMinor: savings.reduce((sum, x) => sum + x.amountMinor, 0),
            targetMinor: savingsTarget,
          }
        : null;
    const summary = monthSummary(rows, days as DayRow[], month, today, budget);
    const progress = waterGoalProgress(water as WaterRow[], today, target);
    const waterDays = waterGoalDays(water as WaterRow[], today, target);
    const breakdown = categoryBreakdown(rows, monthStart(month), monthEnd(month));
    const foodChange = monthOverMonthChange(rows, days as DayRow[], month, 'Food');
    const now = new Date();
    setS({
      cards,
      summary,
      todayMinor: spendingTotal(rows, today, today),
      todayKnown: knownDays(rows, days as DayRow[], today, today).size > 0,
      todayComplete: (days as DayRow[]).some((d) => d.localDate === today && d.spendingComplete),
      waterMl: progress.ml,
      waterPct: progress.percent,
      waterTarget: target,
      waterDays,
      nutrition: dayNutrition(food as FoodRow[], today),
      nextMeal: nextMealToday(meals, now.getHours() * 60 + now.getMinutes(), (food as FoodRow[]).map((f) => f.mealType)),
      insights: buildInsights({ summary, breakdown, foodChange, waterGoalDays: waterDays }),
      coming,
    });
  }, [repos, today, version]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => Alert.alert('Could not load', message(e)));
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      changed();
    } catch (e) {
      Alert.alert('Could not save', message(e));
    }
  };
  const addWater = (ml: number) => run(() => repos.addWater(ml));
  const markComplete = () => run(() => repos.setSpendingComplete(today, !s?.todayComplete));
  const saveCards = (next: CardId[]) => run(() => repos.setDashboardCards(next));

  if (!s) {
    return (
      <Page>
        <Title>Today</Title>
        <Muted>Loading...</Muted>
      </Page>
    );
  }
  const m = s.summary;

  const cards: Record<CardId, React.ReactNode> = {
    money: (
      <Card key="money">
        <Heading>Spent today</Heading>
        <Big>{s.todayKnown ? formatInr(s.todayMinor) : 'Nothing recorded'}</Big>
        {!s.todayKnown && <Muted>Add expenses in the Spend tab.</Muted>}
        <Button
          title={s.todayComplete ? 'Marked: I recorded everything (tap to undo)' : 'I recorded everything I spent today'}
          kind={s.todayComplete ? 'secondary' : 'primary'}
          onPress={markComplete}
        />
        <Muted>A day with no entries counts as zero only when you mark it; otherwise it is unknown.</Muted>
      </Card>
    ),
    coming: (
      <Card key="coming">
        <Heading>Coming up</Heading>
        {s.coming ? (
          <>
            {s.coming.salary && (
              <Text style={{ color: c.text, fontSize: 14 }}>
                Salary: {s.coming.salary.date} ({s.coming.salary.days === 0 ? 'today' : `in ${s.coming.salary.days} days`})
                {s.coming.salary.amountMinor ? ` · about ${formatInr(s.coming.salary.amountMinor)}` : ''}
              </Text>
            )}
            {s.coming.emis.slice(0, 3).map((e) => (
              <Text key={e.name + e.date} style={{ color: c.text, fontSize: 14 }}>
                EMI {e.name}: {formatInr(e.amountMinor)} on {e.date} ({e.days === 0 ? 'today' : `in ${e.days} days`}) · {e.k} of {e.total}
              </Text>
            ))}
            {s.coming.targetMinor !== null && (
              <Text style={{ color: c.text, fontSize: 14 }}>
                Savings this month: {formatInr(s.coming.savedMinor)} of {formatInr(s.coming.targetMinor)}
              </Text>
            )}
          </>
        ) : (
          <Muted>Nothing set yet. Add salary, loans and savings in the Plan tab.</Muted>
        )}
      </Card>
    ),
    month: (
      <Card key="month">
        <Heading>This month</Heading>
        <Row>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{formatInr(m.totalMinor)}</Text>
          <Muted>
            spent, {m.knownDays} of {m.elapsedDays} days recorded
          </Muted>
        </Row>
        <Row>
          <Muted>Average per recorded day:</Muted>
          <Text style={{ color: c.text }}>{m.average.value === null ? 'not enough data' : formatInr(m.average.value)}</Text>
          {confidenceText(m.average)}
        </Row>
        <Row>
          <Muted>Projected for the month:</Muted>
          <Text style={{ color: c.text }}>{m.projection.value === null ? 'not enough data' : formatInr(m.projection.value)}</Text>
          {m.projection.value !== null && <Badge text={`ESTIMATE · ${m.projection.confidence}`} />}
        </Row>
        {m.budget && (
          <>
            <Progress percent={m.budget.utilizationPercent} />
            <Muted>
              Budget {formatInr(m.budget.budgetMinor)}: {m.budget.remainingMinor >= 0 ? `${formatInr(m.budget.remainingMinor)} left` : `${formatInr(-m.budget.remainingMinor)} over`} ({m.budget.utilizationPercent}% used)
            </Muted>
          </>
        )}
        {!m.budget && <Muted>No budget set. Set one in the More tab.</Muted>}
      </Card>
    ),
    water: (
      <Card key="water">
        <Heading>Water</Heading>
        <Row>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{(s.waterMl / 1000).toFixed(2).replace(/\.?0+$/, '') || '0'} L</Text>
          <Muted>of {(s.waterTarget / 1000).toFixed(1)} L</Muted>
        </Row>
        <Progress percent={s.waterPct} />
        <Row>
          {[250, 500, 750, 1000].map((ml) => (
            <Button key={ml} title={ml === 1000 ? '+1 L' : `+${ml} ml`} kind="secondary" onPress={() => addWater(ml)} />
          ))}
        </Row>
        {s.waterDays.value !== null && (
          <Muted>
            Target met on {s.waterDays.value} of the last 7 days{s.waterDays.estimated ? ' (some days have no water recorded)' : ''}.
          </Muted>
        )}
      </Card>
    ),
    food: (
      <Card key="food">
        <Heading>Food</Heading>
        {s.nutrition.entries === 0 ? (
          <Muted>No food recorded today.</Muted>
        ) : (
          <>
            <Text style={{ color: c.text, fontSize: 16 }}>
              {s.nutrition.calories} kcal · {s.nutrition.proteinG} g protein · {s.nutrition.entries} entries
            </Text>
            {s.nutrition.partial && <Muted>{s.nutrition.entriesWithoutCalories} entries have no calories entered, so these totals are at least this much.</Muted>}
          </>
        )}
        {s.nextMeal ? (
          <Text style={{ color: c.text, fontSize: 14 }}>
            Next meal: {s.nextMeal.label} at {s.nextMeal.time}
          </Text>
        ) : (
          <Muted>Set meal times in the Food tab to get a reminder at each meal.</Muted>
        )}
      </Card>
    ),
    insights: (
      <Card key="insights">
        <Heading>Insights</Heading>
        {s.insights.map((t) => (
          <Text key={t} style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>
            • {t}
          </Text>
        ))}
        <Muted>Calculated on this phone from your entries. No AI.</Muted>
      </Card>
    ),
  };

  return (
    <Page>
      <Row style={{ justifyContent: 'space-between' }}>
        <Title>Today</Title>
        <Button title={editing ? 'Done' : 'Customize'} kind="secondary" onPress={() => setEditing(!editing)} />
      </Row>
      <Muted>{today}</Muted>

      {editing && (
        <Card>
          <Heading>Your dashboard</Heading>
          <Muted>Choose what to show and the order. Hidden cards are still available; switch them back on here.</Muted>
          {[...s.cards, ...ALL_CARDS.filter((id) => !s.cards.includes(id))].map((id) => {
            const shown = s.cards.includes(id);
            return (
              <Row key={id}>
                <Chip label={CARD_LABELS[id]} active={shown} onPress={() => saveCards(toggleCard(s.cards, id))} />
                {shown && (
                  <>
                    <Button title="Up" kind="secondary" onPress={() => saveCards(moveCard(s.cards, id, -1))} />
                    <Button title="Down" kind="secondary" onPress={() => saveCards(moveCard(s.cards, id, 1))} />
                  </>
                )}
              </Row>
            );
          })}
        </Card>
      )}

      {s.cards.length === 0 && !editing && <Muted>Nothing is shown. Tap Customize to choose what you want to see.</Muted>}
      {s.cards.map((id) => cards[id])}
    </Page>
  );
}
