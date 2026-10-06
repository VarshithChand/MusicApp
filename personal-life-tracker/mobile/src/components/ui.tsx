import React from 'react';
import { Pressable, ScrollView, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../theme';

/** Page frame: scrolls, keeps clear of the status bar, and keeps the keyboard from hiding a field. */
export function Page({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 32, gap: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: c.bg }} />
    </View>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 26, fontWeight: '700' }}>{children}</Text>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 17, fontWeight: '700' }}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  const c = useColors();
  return <Text style={[{ color: c.muted, fontSize: 13, lineHeight: 18 }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.card, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: c.border }, style]}>{children}</View>;
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Big({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 30, fontWeight: '700' }}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'primary', disabled }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.danger : c.track;
  const fg = kind === 'primary' ? c.onAccent : kind === 'danger' ? '#fff' : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={{ backgroundColor: bg, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ color: fg, fontSize: 15, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent : 'transparent' }}
    >
      <Text style={{ color: active ? c.onAccent : c.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const c = useColors();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 4 }}>
      {!!label && <Muted>{label}</Muted>}
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        {...rest}
        style={[{ color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: c.bg }, style]}
      />
    </View>
  );
}

export function Progress({ percent }: { percent: number }) {
  const c = useColors();
  const p = Math.max(0, Math.min(100, percent));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }} style={{ height: 12, borderRadius: 6, backgroundColor: c.track, overflow: 'hidden' }}>
      <View style={{ width: `${p}%`, height: 12, backgroundColor: c.accent }} />
    </View>
  );
}

/** Small label shown next to a result that is an estimate or has low confidence. */
export function Badge({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'ok' }) {
  const c = useColors();
  const col = tone === 'ok' ? c.ok : c.warn;
  return (
    <View style={{ borderWidth: 1, borderColor: col, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Text style={{ color: col, fontSize: 11, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}
