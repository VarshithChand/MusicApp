import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, localNoon, monthGrid, monthOf, nextMonth, prevMonth } from '../lib/dates';
import { useColors } from '../theme';
import { Button, Chip, Muted, Row } from './ui';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The date a new entry is recorded for. Starts at today and goes back to today by itself when the day changes. */
export function useEntryDate(today: string): [string, (d: string) => void] {
  const [date, setDate] = useState(today);
  useEffect(() => {
    setDate(today);
  }, [today]);
  return [date, setDate];
}

/**
 * The Date to store for an entry on `date`: the real current time when it is today, noon of that day otherwise.
 * The record keeps the local calendar date, so grouping by day never depends on the time of day.
 */
export function entryTime(date: string, today: string): Date {
  return date === today ? new Date() : localNoon(date);
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** A month calendar. Future days can not be chosen. */
export function Calendar({ value, today, onPick }: { value: string; today: string; onPick: (d: string) => void }) {
  const c = useColors();
  const [month, setMonth] = useState(monthOf(value));
  const grid = monthGrid(month);
  const atCurrent = month >= monthOf(today);
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title="‹" kind="secondary" onPress={() => setMonth(prevMonth(month))} />
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{monthLabel(month)}</Text>
        <Button title="›" kind="secondary" disabled={atCurrent} onPress={() => setMonth(nextMonth(month))} />
      </Row>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 12 }}>
            {w}
          </Text>
        ))}
      </View>
      {grid.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((d, i) => {
            if (!d) {
              return <View key={i} style={{ flex: 1, height: 40 }} />;
            }
            const future = d > today;
            const selected = d === value;
            return (
              <Pressable
                key={i}
                disabled={future}
                onPress={() => onPick(d)}
                accessibilityLabel={d}
                accessibilityState={{ selected, disabled: future }}
                style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: selected ? c.accent : 'transparent' }}
              >
                <Text style={{ color: selected ? c.onAccent : future ? c.border : d === today ? c.accent : c.text, fontSize: 15, fontWeight: d === today ? '700' : '400' }}>{Number(d.slice(8))}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** "Which day is this for?": Today, Yesterday, or any earlier date from a calendar. */
export function DateField({ value, today, onChange }: { value: string; today: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const other = value !== today && value !== addDays(today, -1);
  return (
    <View style={{ gap: 8 }}>
      <Muted>Day</Muted>
      <Row>
        <Chip label="Today" active={value === today} onPress={() => { onChange(today); setOpen(false); }} />
        <Chip label="Yesterday" active={value === addDays(today, -1)} onPress={() => { onChange(addDays(today, -1)); setOpen(false); }} />
        <Chip label={other ? value : 'Pick a date'} active={other || open} onPress={() => setOpen(!open)} />
      </Row>
      {open && (
        <Calendar
          value={value}
          today={today}
          onPick={(d) => {
            onChange(d);
            setOpen(false);
          }}
        />
      )}
      {value !== today && <Muted>Recording for {value}.</Muted>}
    </View>
  );
}
