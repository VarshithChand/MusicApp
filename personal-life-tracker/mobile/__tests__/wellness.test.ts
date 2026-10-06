import {
  averageDailyWater,
  cleanWater,
  dayNutrition,
  foodShareOfSpending,
  foodSpending,
  frequentFoods,
  recentWater,
  waterForDay,
  waterGoalDays,
  waterGoalProgress,
} from '../src/analytics/wellness';
import { FoodRow, WaterRow } from '../src/analytics/types';

const w = (localDate: string, ml: number, id?: number): WaterRow => ({ localDate, ml, id });
const food = (over: Partial<FoodRow> & { name: string }): FoodRow => ({
  localDate: '2026-10-05',
  mealType: 'lunch',
  calories: null,
  proteinG: null,
  costMinor: null,
  place: null,
  ...over,
});

describe('water', () => {
  it('adds up a day and measures progress against the target', () => {
    const rows = [w('2026-10-05', 250), w('2026-10-05', 500), w('2026-10-04', 1000)];
    expect(waterForDay(rows, '2026-10-05')).toBe(750);
    expect(waterGoalProgress(rows, '2026-10-05', 3000)).toEqual({ ml: 750, percent: 25, met: false });
    expect(waterGoalProgress([w('2026-10-05', 3000)], '2026-10-05', 3000).met).toBe(true);
  });

  it('ignores invalid and duplicate records', () => {
    const rows = [w('2026-10-05', 250, 1), w('2026-10-05', 250, 1), w('2026-10-05', -100, 2), w('2026-10-05', 0, 3), w('2026-13-05', 300, 4)];
    expect(cleanWater(rows)).toHaveLength(1);
    expect(waterForDay(rows, '2026-10-05')).toBe(250);
  });

  it('lists the last 7 days oldest first across a month boundary, and separates "0 recorded" from "not recorded"', () => {
    const rows = [w('2026-09-30', 3000), w('2026-10-02', 1000)];
    const r = recentWater(rows, '2026-10-02', 3000, 7);
    expect(r).toHaveLength(7);
    expect(r[0].date).toBe('2026-09-26');
    expect(r[6].date).toBe('2026-10-02');
    expect(r[4]).toMatchObject({ date: '2026-09-30', ml: 3000, logged: true, met: true });
    expect(r[5]).toMatchObject({ date: '2026-10-01', ml: 0, logged: false, met: false });
  });

  it('counts goal days but marks the result estimated when days have no data', () => {
    const rows = [w('2026-10-01', 3000), w('2026-10-02', 3500), w('2026-10-03', 1000)];
    const f = waterGoalDays(rows, '2026-10-03', 3000, 7);
    expect(f.value).toBe(2);
    expect(f.estimated).toBe(true);
    expect(f.confidence).toBe('LOW');
    expect(f.note).toMatch(/4 of 7 days/);
  });

  it('gives no answer when nothing was recorded', () => {
    const f = waterGoalDays([], '2026-10-03', 3000);
    expect(f.value).toBeNull();
    expect(f.confidence).toBe('NONE');
  });

  it('a full week of records is not estimated', () => {
    const rows = ['26', '27', '28', '29', '30'].map((d) => w(`2026-09-${d}`, 3000)).concat([w('2026-10-01', 3000), w('2026-10-02', 3000)]);
    const f = waterGoalDays(rows, '2026-10-02', 3000, 7);
    expect(f.value).toBe(7);
    expect(f.estimated).toBe(false);
    expect(f.confidence).toBe('HIGH');
  });

  it('averages over recorded days only', () => {
    const rows = [w('2026-10-01', 2000), w('2026-10-01', 1000), w('2026-10-03', 3000)];
    const a = averageDailyWater(rows, '2026-10-01', '2026-10-04');
    expect(a.value).toBe(3000); // (3000 + 3000) / 2 recorded days
    expect(a.estimated).toBe(true);
    expect(averageDailyWater([], '2026-10-01', '2026-10-04').value).toBeNull();
  });
});

describe('food', () => {
  it('totals calories and protein and flags entries that had no calories', () => {
    const rows = [
      food({ name: 'Rice', calories: 300, proteinG: 6 }),
      food({ name: 'Dal', calories: 200, proteinG: 12.5 }),
      food({ name: 'Tea' }), // no calories entered
    ];
    expect(dayNutrition(rows, '2026-10-05')).toEqual({ entries: 3, calories: 500, proteinG: 18.5, partial: true, entriesWithoutCalories: 1 });
  });

  it('a day with nothing recorded has zero entries, not made-up numbers', () => {
    expect(dayNutrition([], '2026-10-05')).toEqual({ entries: 0, calories: 0, proteinG: 0, partial: false, entriesWithoutCalories: 0 });
  });

  it('ignores blank names, bad dates and repeated ids', () => {
    const rows = [food({ name: '  ', calories: 100 }), food({ name: 'Rice', calories: 100, localDate: '2026-02-30' }), food({ name: 'Rice', calories: 100, id: 1 }), food({ name: 'Rice', calories: 100, id: 1 })];
    expect(dayNutrition(rows, '2026-10-05').entries).toBe(1);
  });

  it('adds up food spending, restaurant spending and entries without a cost', () => {
    const rows = [
      food({ name: 'Biryani', costMinor: 25000, place: 'restaurant' }),
      food({ name: 'Rice', costMinor: 4000, place: 'home' }),
      food({ name: 'Snack' }),
      food({ name: 'Old', costMinor: 9999, localDate: '2026-09-30' }),
    ];
    expect(foodSpending(rows, '2026-10-01', '2026-10-31')).toEqual({ totalMinor: 29000, restaurantMinor: 25000, entriesWithoutCost: 1 });
  });

  it('finds frequent foods ignoring case and spaces', () => {
    const rows = [food({ name: 'Idli' }), food({ name: ' idli ' }), food({ name: 'Dosa' }), food({ name: 'IDLI' })];
    expect(frequentFoods(rows, '2026-10-01', '2026-10-31')).toEqual([
      { name: 'Idli', count: 3 },
      { name: 'Dosa', count: 1 },
    ]);
  });

  it('gives the food share of total spending, or nothing when there is no spending', () => {
    expect(foodShareOfSpending(29000, 100000)).toBe(29);
    expect(foodShareOfSpending(0, 100000)).toBe(0);
    expect(foodShareOfSpending(100, 0)).toBeNull();
  });
});
