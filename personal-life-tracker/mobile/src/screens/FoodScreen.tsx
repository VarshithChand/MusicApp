import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FoodRow, Place } from '../analytics/types';
import { dayNutrition, foodSpending, frequentFoods } from '../analytics/wellness';
import { DateField, entryTime, useEntryDate } from '../components/DateField';
import { Button, Card, Chip, Heading, Input, Muted, Page, Row, Title } from '../components/ui';
import { useData } from '../data';
import { MEAL_TYPES, MealType } from '../db/repos';
import { addDays } from '../lib/dates';
import { message } from '../lib/errors';
import { formatInr, parseAmountToMinor } from '../lib/money';
import { useColors } from '../theme';

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  tea_coffee: 'Tea / coffee',
  fruit: 'Fruit',
  fast_food: 'Fast food',
  other: 'Other',
};
const PLACES: { value: Place; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'outside', label: 'Outside' },
];

type Item = FoodRow & { id: number };

export function FoodScreen() {
  const { repos, today, version, changed } = useData();
  const c = useColors();
  const [entryDate, setEntryDate] = useEntryDate(today);
  const [meal, setMeal] = useState<MealType>('lunch');
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [cost, setCost] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    const from = entryDate < addDays(today, -13) ? entryDate : addDays(today, -13);
    setItems(await repos.foodBetween(from, today));
  }, [repos, today, version, entryDate]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => Alert.alert('Could not load', message(e)));
    }, [load]),
  );

  const num = (text: string, label: string): number | null | undefined => {
    if (!text.trim()) {
      return null;
    }
    const v = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(v) || v < 0) {
      Alert.alert(`Check ${label}`, `${label} must be a number, zero or more.`);
      return undefined;
    }
    return v;
  };

  const add = async () => {
    const cal = num(calories, 'Calories');
    const prot = num(protein, 'Protein');
    if (cal === undefined || prot === undefined) {
      return;
    }
    let costMinor: number | null = null;
    if (cost.trim()) {
      costMinor = parseAmountToMinor(cost);
      if (costMinor === null) {
        Alert.alert('Check the cost', 'Enter a cost like 80 or 80.50.');
        return;
      }
    }
    try {
      await repos.addFood({ mealType: meal, name, calories: cal === null ? null : Math.round(cal), proteinG: prot, costMinor, place, now: entryTime(entryDate, today) });
      setName('');
      setCalories('');
      setProtein('');
      setCost('');
      changed();
    } catch (e) {
      Alert.alert('Could not save', message(e));
    }
  };

  const remove = (item: Item) =>
    Alert.alert('Delete this entry?', `${item.name} on ${item.localDate}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => repos.deleteFood(item.id).then(changed).catch((e) => Alert.alert('Could not delete', message(e))) },
    ]);

  const dates = [...new Set(items.map((i) => i.localDate))];
  const spend = foodSpending(items, addDays(today, -13), today);
  const frequent = frequentFoods(items, addDays(today, -13), today, 3);

  return (
    <Page>
      <Title>Food</Title>

      <Card>
        <Heading>Add food</Heading>
        <DateField value={entryDate} today={today} onChange={setEntryDate} />
        <Row>
          {MEAL_TYPES.map((m) => (
            <Chip key={m} label={MEAL_LABEL[m]} active={meal === m} onPress={() => setMeal(m)} />
          ))}
        </Row>
        <Input label="What did you eat?" value={name} onChangeText={setName} placeholder="e.g. Rice and dal" />
        <Row>
          <View style={{ flex: 1 }}>
            <Input label="Calories (optional)" value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="e.g. 450" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Protein g (optional)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder="e.g. 15" />
          </View>
        </Row>
        <Input label="Cost in rupees (optional)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="e.g. 80" />
        <Row>
          {PLACES.map((p) => (
            <Chip key={p.value} label={p.label} active={place === p.value} onPress={() => setPlace(place === p.value ? null : p.value)} />
          ))}
        </Row>
        <Button title="Add food" onPress={add} />
      </Card>

      <Card>
        <Heading>Recent entries</Heading>
        <Muted>
          Food spending recorded: {formatInr(spend.totalMinor)} (restaurants {formatInr(spend.restaurantMinor)})
          {spend.entriesWithoutCost > 0 ? `. ${spend.entriesWithoutCost} entries have no cost.` : ''}
        </Muted>
        {frequent.length > 0 && <Muted>Most often: {frequent.map((f) => `${f.name} (${f.count})`).join(', ')}</Muted>}
      </Card>

      {items.length === 0 && <Muted>No food recorded in the last 14 days, or on the day you picked.</Muted>}
      {dates.map((d) => {
        const n = dayNutrition(items, d);
        return (
          <Card key={d}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Heading>{d === today ? `Today (${d})` : d}</Heading>
              <Muted>
                {n.calories}
                {n.partial ? '+' : ''} kcal · {n.proteinG} g protein
              </Muted>
            </Row>
            {items
              .filter((i) => i.localDate === d)
              .map((i) => (
                <Pressable key={i.id} onLongPress={() => remove(i)} style={{ paddingVertical: 4 }} accessibilityHint="Long press to delete">
                  <Text style={{ color: c.text, fontSize: 15 }}>{i.name}</Text>
                  <Muted>
                    {MEAL_LABEL[i.mealType as MealType] ?? i.mealType}
                    {i.calories !== null ? ` · ${i.calories} kcal` : ''}
                    {i.costMinor !== null ? ` · ${formatInr(i.costMinor)}` : ''}
                    {i.place ? ` · ${i.place}` : ''}
                  </Muted>
                </Pressable>
              ))}
          </Card>
        );
      })}
      {items.length > 0 && <Muted>Long press an entry to delete it. A "+" after kcal means some entries had no calories entered.</Muted>}
    </Page>
  );
}
