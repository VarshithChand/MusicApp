import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { Icon } from '../components/Icon';
import { FONT_FAMILIES, FontChoice, LookChoice, TextSize, ThemeChoice, useSettings } from '../store/settings';
import { colors, themedStyles } from '../theme/theme';

const LOOKS: { key: LookChoice; label: string }[] = [
  { key: 'default', label: 'Default' },
  { key: 'glass', label: 'Glass' },
  { key: 'neo', label: 'Neo-brutalist' },
];

const THEMES: { key: ThemeChoice; label: string }[] = [
  { key: 'system', label: 'System default' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

const FONTS: { key: FontChoice; label: string }[] = [
  { key: 'system', label: 'Default' },
  { key: 'serif', label: 'Serif' },
  { key: 'mono', label: 'Monospace' },
  { key: 'condensed', label: 'Condensed' },
  { key: 'light', label: 'Light' },
];

const SIZES: { key: TextSize; label: string }[] = [
  { key: 'small', label: 'Small' },
  { key: 'normal', label: 'Normal' },
  { key: 'large', label: 'Large' },
];

function Pills<T extends string>({
  options,
  value,
  onChange,
  fontFor,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  fontFor?: (key: T) => string | undefined;
}) {
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            style={[styles.pill, on && styles.pillOn]}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.pillText, on && styles.pillTextOn, fontFor ? { fontFamily: fontFor(o.key) } : null]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const look = useSettings((s) => s.look);
  const theme = useSettings((s) => s.mode);
  const font = useSettings((s) => s.font);
  const textSize = useSettings((s) => s.textSize);
  const update = useSettings((s) => s.update);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>Appearance</Text>
      </View>

      <Text style={styles.h2}>Look</Text>
      <Pills options={LOOKS} value={look} onChange={(l) => update({ look: l })} />

      <Text style={styles.h2}>Theme</Text>
      <Pills options={THEMES} value={theme} onChange={(t) => update({ mode: t })} />

      <Text style={styles.h2}>Font</Text>
      <Pills options={FONTS} value={font} onChange={(f) => update({ font: f })} fontFor={(f) => FONT_FAMILIES[f] ?? 'sans-serif'} />

      <Text style={styles.h2}>Text size</Text>
      <Pills options={SIZES} value={textSize} onChange={(s) => update({ textSize: s })} />

      <Text style={styles.h2}>Preview</Text>
      <View style={styles.preview}>
        <Text style={styles.previewTitle}>Your music, everywhere.</Text>
        <Text style={styles.muted}>Telugu, Hindi and English songs in one place.</Text>
      </View>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  h2: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 },
  muted: { color: colors.muted, fontSize: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pillTextOn: { color: colors.onAccent },
  preview: { gap: 6, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  previewTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
}));
