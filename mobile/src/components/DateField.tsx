import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { AppText as Text } from './AppText';
import { colors, themedStyles } from '../theme/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');

function parse(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) } : null;
}

/** Date picker with month and year navigation and a full calendar grid. Values are YYYY-MM-DD. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const thisYear = today.getFullYear();
  const oldestYear = thisYear - 120;
  const years = Array.from({ length: thisYear - oldestYear + 1 }, (_, i) => thisYear - i);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'years'>('days');
  const [view, setView] = useState({ y: 2000, m: 0 });

  const openPicker = () => {
    const p = parse(value);
    setView(p ? { y: p.y, m: p.m } : { y: 2000, m: 0 });
    setMode('days');
    setOpen(true);
  };

  const prevMonth = () => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const nextMonth = () => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
  const canNext = view.y < thisYear || (view.y === thisYear && view.m < today.getMonth());
  const canPrev = view.y > oldestYear || (view.y === oldestYear && view.m > 0);

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  const selected = parse(value);
  const isFuture = (d: number) => new Date(view.y, view.m, d) > new Date(thisYear, today.getMonth(), today.getDate());

  const pick = (d: number) => {
    onChange(`${view.y}-${pad(view.m + 1)}-${pad(d)}`);
    setOpen(false);
  };

  const display = selected ? `${pad(selected.d)} ${MONTHS[selected.m]} ${selected.y}` : '';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={openPicker} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={display ? styles.value : styles.placeholder}>{display || 'Choose your date of birth'}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <Pressable style={[styles.navBtn, !canPrev && styles.disabled]} onPress={prevMonth} disabled={!canPrev} accessibilityLabel="Previous month">
                <Text style={styles.navText}>‹</Text>
              </Pressable>
              <Pressable style={styles.titleBtn} onPress={() => setMode(mode === 'days' ? 'years' : 'days')} accessibilityLabel="Change year">
                <Text style={styles.title}>{MONTHS[view.m]} {view.y}</Text>
                <Text style={styles.titleHint}>{mode === 'days' ? 'Tap for year' : 'Pick a month above'}</Text>
              </Pressable>
              <Pressable style={[styles.navBtn, !canNext && styles.disabled]} onPress={nextMonth} disabled={!canNext} accessibilityLabel="Next month">
                <Text style={styles.navText}>›</Text>
              </Pressable>
            </View>

            {mode === 'years' ? (
              <ScrollView style={styles.yearScroll} contentContainerStyle={styles.yearGrid}>
                {years.map((y) => {
                  const on = y === view.y;
                  return (
                    <Pressable
                      key={y}
                      style={[styles.yearCell, on && styles.cellOn]}
                      onPress={() => {
                        setView((v) => ({ y, m: v.m }));
                        setMode('days');
                      }}
                    >
                      <Text style={[styles.yearText, on && styles.cellTextOn]}>{y}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {WEEKDAYS.map((w) => (
                    <Text key={w} style={styles.weekday}>
                      {w}
                    </Text>
                  ))}
                </View>
                {rows.map((row, r) => (
                  <View key={r} style={styles.weekRow}>
                    {row.map((d, c) => {
                      if (d === null) return <View key={c} style={styles.cell} />;
                      const future = isFuture(d);
                      const on = selected && selected.y === view.y && selected.m === view.m && selected.d === d;
                      return (
                        <Pressable
                          key={c}
                          style={[styles.cell, on && styles.cellOn]}
                          onPress={() => pick(d)}
                          disabled={future}
                          accessibilityLabel={`${d} ${MONTHS[view.m]} ${view.y}`}
                        >
                          <Text style={[styles.dayText, on && styles.cellTextOn, future && styles.futureText]}>{d}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </>
            )}

            <Pressable style={styles.cancelBtn} onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '500' },
  field: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  value: { color: colors.text, fontSize: 16 },
  placeholder: { color: colors.muted, fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 380, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  navText: { color: colors.text, fontSize: 26, fontWeight: '600', marginTop: -4 },
  titleBtn: { flex: 1, alignItems: 'center', gap: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  titleHint: { color: colors.muted, fontSize: 12 },
  disabled: { opacity: 0.35 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '600', paddingVertical: 4 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, margin: 2 },
  cellOn: { backgroundColor: colors.accent },
  dayText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  futureText: { color: colors.muted, opacity: 0.4 },
  cellTextOn: { color: colors.onAccent, fontWeight: '700' },
  yearScroll: { maxHeight: 320 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  yearCell: { width: '30%', height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  yearText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  cancelBtn: { height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.text, fontSize: 15, fontWeight: '600' },
}));
