import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen, useOnFocus } from '../components/Screen';
import { Card, Chip, H1, Muted } from '../components/ui';
import { securityApi } from '../services/native';
import { useApp } from '../store/useApp';
import { colors } from '../theme';
import { LockMode } from '../types';

const MODES: { mode: LockMode; title: string; text: string }[] = [
  { mode: 'IMMEDIATE', title: 'Every time', text: 'Ask each time you open a locked app from somewhere else. Moving around inside the app does not ask again.' },
  { mode: 'AFTER_SCREEN_LOCK', title: 'After screen lock', text: 'Ask once, then not again until the screen turns off and on.' },
  { mode: 'TIMED', title: 'After a time away', text: 'Stay unlocked for a while after you leave the app. Coming back sooner does not ask.' },
];
const GRACE = [1, 5, 15, 30];

/** Re-lock behaviour. The rules themselves run in Kotlin (LockStateMachine); this only chooses them. */
export function LockSettingsScreen() {
  const settings = useApp((s) => s.settings);
  const loadSettings = useApp((s) => s.loadSettings);

  useOnFocus(() => {
    loadSettings().catch(() => {});
  });

  const choose = async (patch: Parameters<typeof securityApi.updateSettings>[0]) => {
    await securityApi.updateSettings(patch);
    await loadSettings();
  };

  return (
    <Screen>
      <H1>Re-lock</H1>
      <Muted>Choose when a locked app asks for your fingerprint or PIN again.</Muted>
      {MODES.map((m) => {
        const active = settings?.lockMode === m.mode;
        return (
          <Pressable key={m.mode} onPress={() => choose({ lockMode: m.mode })} accessibilityRole="radio" accessibilityState={{ selected: active }}>
            <Card style={active ? styles.active : undefined}>
              <View style={styles.row}>
                <View style={[styles.radio, active && styles.radioOn]} />
                <Text style={styles.title}>{m.title}</Text>
              </View>
              <Muted>{m.text}</Muted>
              {m.mode === 'TIMED' && active && (
                <View style={styles.chips}>
                  {GRACE.map((g) => (
                    <Chip key={g} label={`${g} min`} active={settings?.graceMinutes === g} onPress={() => choose({ graceMinutes: g })} />
                  ))}
                </View>
              )}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  active: { borderWidth: 1, borderColor: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.muted },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
});
