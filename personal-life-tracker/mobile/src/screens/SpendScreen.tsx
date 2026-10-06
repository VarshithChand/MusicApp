import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { monthSummary, MonthSummary } from '../analytics/spending';
import { DayRow, ExpenseRow } from '../analytics/types';
import { DateField, entryTime, useEntryDate } from '../components/DateField';
import { Badge, Button, Card, Chip, Heading, Input, Muted, Page, Row, Title } from '../components/ui';
import { useData } from '../data';
import { Category } from '../db/repos';
import { monthEnd, monthOf, monthStart, nextMonth, prevMonth } from '../lib/dates';
import { message } from '../lib/errors';
import { formatInr, parseAmountToMinor } from '../lib/money';
import { useColors } from '../theme';

type Item = ExpenseRow & { note: string | null };

export function SpendScreen() {
  const { repos, today, version, changed } = useData();
  const c = useColors();
  const [month, setMonth] = useState(monthOf(today));
  const [cats, setCats] = useState<Category[]>([]);
  const [catId, setCatId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [entryDate, setEntryDate] = useEntryDate(today);
  const [dayComplete, setDayComplete] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);

  const load = useCallback(async () => {
    const from = monthStart(month);
    const to = monthEnd(month);
    const [categories, rows, days, budget, entryDay] = await Promise.all([
      repos.categories(),
      repos.expensesBetween(from, to),
      repos.dayStatusBetween(from, to),
      repos.getBudget(month),
      repos.dayStatusBetween(entryDate, entryDate),
    ]);
    setDayComplete(entryDay.some((d) => d.spendingComplete));
    setCats(categories);
    setCatId((cur) => cur ?? categories[0]?.id ?? null);
    setItems(rows);
    setSummary(monthSummary(rows, days as DayRow[], month, today, budget));
  }, [repos, month, today, version, entryDate]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => Alert.alert('Could not load', message(e)));
    }, [load]),
  );
  useEffect(() => {
    setMonth(monthOf(today));
  }, [today]);

  const add = async () => {
    const minor = parseAmountToMinor(amount);
    if (minor === null) {
      Alert.alert('Check the amount', 'Enter an amount like 120 or 120.50.');
      return;
    }
    if (catId === null) {
      Alert.alert('Choose a category');
      return;
    }
    try {
      await repos.addExpense({ amountMinor: minor, categoryId: catId, note, now: entryTime(entryDate, today) });
      setAmount('');
      setNote('');
      changed();
    } catch (e) {
      Alert.alert('Could not save', message(e));
    }
  };

  const remove = (item: Item) =>
    Alert.alert('Delete this expense?', `${item.category} ${formatInr(item.amountMinor)} on ${item.localDate}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          repos.deleteExpense(item.id).then(changed).catch((e) => Alert.alert('Could not delete', message(e)));
        },
      },
    ]);

  return (
    <Page>
      <Title>Spend</Title>

      <Card>
        <Heading>Add an expense</Heading>
        <Input label="Amount (rupees)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 120" accessibilityLabel="Amount in rupees" />
        <Muted>Category</Muted>
        <Row>
          {cats.map((k) => (
            <Chip key={k.id} label={k.name} active={catId === k.id} onPress={() => setCatId(k.id)} />
          ))}
        </Row>
        <DateField
          value={entryDate}
          today={today}
          onChange={(d) => {
            setEntryDate(d);
            setMonth(monthOf(d));
          }}
        />
        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. lunch with friends" />
        <Button title="Add expense" onPress={add} />
        <Button
          title={dayComplete ? `${entryDate}: marked as fully recorded (tap to undo)` : `I recorded everything for ${entryDate}`}
          kind="secondary"
          onPress={() => {
            repos.setSpendingComplete(entryDate, !dayComplete).then(changed).catch((e) => Alert.alert('Could not save', message(e)));
          }}
        />
        <Muted>Marking a day lets a day with no spending count as zero. Use it for days you spent nothing.</Muted>
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <Button title="‹" kind="secondary" onPress={() => setMonth(prevMonth(month))} />
        <Heading>{month}</Heading>
        <Button title="›" kind="secondary" onPress={() => setMonth(nextMonth(month))} />
      </Row>

      {summary && (
        <Card>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{formatInr(summary.totalMinor)}</Text>
          <Muted>
            {summary.knownDays} of {summary.elapsedDays || summary.totalDays} days recorded
          </Muted>
          {summary.average.value !== null && (
            <Row>
              <Muted>Average per recorded day {formatInr(summary.average.value)}</Muted>
              {summary.average.estimated && <Badge text="ESTIMATE" />}
            </Row>
          )}
        </Card>
      )}

      <Card>
        <Heading>Expenses</Heading>
        {items.length === 0 && <Muted>No expenses recorded for this month.</Muted>}
        {items.map((e) => (
          <Pressable key={e.id} onLongPress={() => remove(e)} accessibilityHint="Long press to delete" style={{ paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 15 }}>
                {e.category}
                {e.fixed ? ' · fixed' : ''}
              </Text>
              <Muted>
                {e.localDate}
                {e.note ? ` · ${e.note}` : ''}
              </Muted>
            </View>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{formatInr(e.amountMinor)}</Text>
          </Pressable>
        ))}
        {items.length > 0 && <Muted>Long press an expense to delete it.</Muted>}
      </Card>
    </Page>
  );
}
