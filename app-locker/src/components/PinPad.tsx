import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  length: number;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  /** Changing this value clears the entered digits (e.g. after a wrong PIN). */
  resetKey?: number;
}

const ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '<']];

/** Number pad with dots. Calls onComplete once, as soon as `length` digits are entered. */
export function PinPad({ length, onComplete, disabled, resetKey = 0 }: Props) {
  const [digits, setDigits] = useState('');

  useEffect(() => setDigits(''), [resetKey]);

  const press = (k: string) => {
    if (disabled) {
      return;
    }
    if (k === '<') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (digits.length >= length) {
      return;
    }
    const next = digits + k;
    setDigits(next);
    if (next.length === length) {
      onComplete(next);
    }
  };

  return (
    <View style={styles.wrap} accessibilityLabel="PIN pad">
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.dot, i < digits.length && styles.dotOn]} />
        ))}
      </View>
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((k, c) =>
            k === '' ? (
              <View key={c} style={styles.key} />
            ) : (
              <Pressable
                key={c}
                onPress={() => press(k)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={k === '<' ? 'Delete' : k}
                style={[styles.key, styles.keyBg, disabled && { opacity: 0.35 }]}
              >
                <Text style={styles.keyText}>{k === '<' ? '⌫' : k}</Text>
              </Pressable>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  dots: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.muted },
  dotOn: { backgroundColor: colors.text, borderColor: colors.text },
  row: { flexDirection: 'row', gap: 20 },
  key: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  keyBg: { backgroundColor: colors.surface2 },
  keyText: { color: colors.text, fontSize: 26 },
});
