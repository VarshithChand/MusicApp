import React from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, useOnFocus } from '../components/Screen';
import { Button, Card, H1, Muted } from '../components/ui';
import { RootParamList } from '../navigation/types';
import { permissionsApi, onNativeEvent } from '../services/native';
import { useApp } from '../store/useApp';
import { Colors, useColors, useStyles } from '../theme';
import { brandTips, summarize } from '../utils/permissions';

type Props = NativeStackScreenProps<RootParamList, 'permissions'>;

const MARK = { ok: '✓', warn: '⚠', missing: '✗' } as const;

/** Shows what Android access App Locker has. Every button opens the matching Android Settings page; nothing is granted silently. */
export function PermissionsScreen(_props: Props) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const tone = { ok: colors.ok, warn: colors.warn, missing: colors.danger } as const;
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
            <Text style={[styles.mark, { color: tone[r.state] }]}>{MARK[r.state]}</Text>
            <Text style={styles.title}>
              {r.title}
              {r.required ? ' (required)' : ''}
            </Text>
          </View>
          <Muted>{r.detail}</Muted>
          {r.state !== 'ok' && r.action && (
            <Button
              title={r.action.label}
              kind={r.required ? 'primary' : 'secondary'}
              onPress={() => permissionsApi.open(r.action!.page).catch(() => {})}
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

const makeStyles = (colors: Colors) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { fontSize: 22, fontWeight: '700', width: 26 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
});
