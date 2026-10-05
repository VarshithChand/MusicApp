import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? colors.accent : kind === 'danger' ? colors.danger : colors.surface2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, style]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.search}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search applications..."
        placeholderTextColor={colors.muted}
        style={styles.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search applications"
      />
      {!!value && (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search" hitSlop={10}>
          <Text style={styles.clear}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}
    >
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Banner({
  tone,
  title,
  text,
  action,
}: {
  tone: 'warn' | 'danger' | 'ok';
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  const c = tone === 'ok' ? colors.ok : tone === 'danger' ? colors.danger : colors.warn;
  return (
    <View style={[styles.banner, { borderColor: c }]}>
      <Text style={[styles.bannerTitle, { color: c }]}>{title}</Text>
      {!!text && <Text style={styles.bannerText}>{text}</Text>}
      {action}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
  clear: { color: colors.muted, fontSize: 26, paddingLeft: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.text, fontSize: 14 },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 6, backgroundColor: colors.surface },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  bannerText: { color: colors.text, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 8 },
  h1: { color: colors.text, fontSize: 28, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14 },
});
