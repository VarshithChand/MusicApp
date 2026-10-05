import React from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, useOnFocus } from '../components/Screen';
import { Button, Card, H1, Muted } from '../components/ui';
import { RootParamList } from '../navigation/types';
import { permissionsApi, onNativeEvent } from '../services/native';
import { useApp } from '../store/useApp';
import { colors } from '../theme';
import { SettingsPage } from '../types';
import { brandTips, summarize } from '../utils/permissions';

type Props = NativeStackScreenProps<RootParamList, 'permissions'>;

const BUTTONS: Record<string, { label: string; page: SettingsPage }> = {
  accessibility: { label: 'Open Accessibility settings', page: 'accessibility' },
  overlay: { label: 'Allow display over other apps', page: 'overlay' },
  battery: { label: 'Remove battery limits', page: 'battery' },
  usage: { label: 'Open usage access', page: 'usage' },
};

const MARK = { ok: '✓', warn: '⚠', missing: '✗' } as const;
const TONE = { ok: colors.ok, warn: colors.warn, missing: colors.danger } as const;

/** Shows what Android access App Locker has. Every button opens the matching Android Settings page; nothing is granted silently. */
export function PermissionsScreen(_props: Props) {
  const permissions = useApp((s) => s.permissions);
  const loadPermissions = useApp((s) => s.loadPermissions);

  const refresh = React.useCallback(() => {
    loadPermissions().catch(() => {});
  }, [loadPermissions]);

  useOnFocus(refresh);

  React.useEffect(() => {
    // Re-check when the user comes back from Android Settings.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const off = onNativeEvent('protectionChanged', refresh);
    return () => {
      sub.remove();
      off();
    };
  }, [refresh]);

  if (!permissions) {
    return (
      <Screen>
        <H1>Permissions & Protection</H1>
        <Muted>Checking...</Muted>
      </Screen>
    );
  }

  const rows = summarize(permissions);
  const tips = brandTips(permissions.manufacturer);

  return (
    <Screen>
      <H1>Permissions & Protection</H1>
      {rows.map((r) => (
        <Card key={r.key}>
          <View style={styles.head}>
            <Text style={[styles.mark, { color: TONE[r.state] }]}>{MARK[r.state]}</Text>
            <Text style={styles.title}>
              {r.title}
              {r.required ? ' (required)' : ''}
            </Text>
          </View>
          <Muted>{r.detail}</Muted>
          {r.state !== 'ok' && BUTTONS[r.key] && (
            <Button
              title={BUTTONS[r.key].label}
              kind={r.required ? 'primary' : 'secondary'}
              onPress={() => permissionsApi.open(BUTTONS[r.key].page).catch(() => {})}
            />
          )}
        </Card>
      ))}

      {!permissions.accessibility && permissions.sdkInt >= 33 && (
        <Card>
          <Text style={styles.title}>Accessibility switch is greyed out?</Text>
          <Muted>
            Android 13 and newer blocks this for apps installed from an APK file. Open App info, tap the three dots at
            the top right, choose "Allow restricted settings", then enable the Accessibility Service again.
          </Muted>
          <Button title="Open App info" kind="secondary" onPress={() => permissionsApi.open('appInfo').catch(() => {})} />
        </Card>
      )}

      <Card>
        <Text style={styles.title}>Your phone: {permissions.manufacturer}</Text>
        {tips.map((t) => (
          <Muted key={t}>• {t}</Muted>
        ))}
        <Button title="Open phone-specific settings" kind="secondary" onPress={() => permissionsApi.open('oem').catch(() => {})} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { fontSize: 22, fontWeight: '700', width: 26 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
});
