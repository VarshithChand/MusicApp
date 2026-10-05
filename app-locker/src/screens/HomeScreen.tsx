import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, useOnFocus } from '../components/Screen';
import { Banner, Button, Card, H1, Muted } from '../components/ui';
import { RootParamList } from '../navigation/types';
import { useApp } from '../store/useApp';
import { Colors, useColors, useStyles } from '../theme';
import { protectionReady, summarize } from '../utils/permissions';

type Props = NativeStackScreenProps<RootParamList, 'home'>;

export function HomeScreen({ navigation }: Props) {
  const styles = useStyles(makeStyles);
  const protectedApps = useApp((s) => s.protectedApps);
  const settings = useApp((s) => s.settings);
  const permissions = useApp((s) => s.permissions);
  const refreshAll = useApp((s) => s.refreshAll);

  useOnFocus(() => {
    refreshAll().catch(() => {});
  });

  const ready = protectionReady(permissions);
  const rows = permissions ? summarize(permissions) : [];
  const okCount = rows.filter((r) => r.state === 'ok').length;

  return (
    <Screen>
      <H1>App Locker</H1>

      {permissions && !ready && (
        <Banner
          tone="danger"
          title="Protection is off"
          text="Turn on the Accessibility Service, otherwise none of your locked apps are protected."
          action={<Button title="Fix now" onPress={() => navigation.navigate('permissions')} />}
        />
      )}
      {ready && <Banner tone="ok" title="Protection is on" />}

      <Card>
        <Text style={styles.big}>{protectedApps.length}</Text>
        <Muted>{protectedApps.length === 1 ? 'app locked' : 'apps locked'}</Muted>
        <Button title="Choose apps to lock" onPress={() => navigation.navigate('app-lock')} />
      </Card>

      <Card>
        <Text style={styles.h}>Security</Text>
        <Row k="PIN" v={settings?.pinConfigured ? 'Set' : 'Not set'} />
        <Row k="Fingerprint" v={settings?.biometricEnabled ? 'On' : 'Off'} />
        <Row k="Re-lock" v={modeName(settings?.lockMode, settings?.graceMinutes)} />
        <View style={styles.actions}>
          <Button title="Security" kind="secondary" onPress={() => navigation.navigate('security')} style={styles.flex} />
          <Button title="Re-lock" kind="secondary" onPress={() => navigation.navigate('lock-settings')} style={styles.flex} />
        </View>
      </Card>

      <Card>
        <Text style={styles.h}>Permissions & Protection</Text>
        <Muted>
          {rows.length ? `${okCount} of ${rows.length} items are in good shape.` : 'Checking...'}
        </Muted>
        <Button title="Open" kind="secondary" onPress={() => navigation.navigate('permissions')} />
      </Card>

      <Button title="About & privacy" kind="secondary" onPress={() => navigation.navigate('about')} />
    </Screen>
  );
}

export function modeName(mode?: string, grace?: number): string {
  if (mode === 'AFTER_SCREEN_LOCK') {
    return 'After screen lock';
  }
  if (mode === 'TIMED') {
    return `After ${grace ?? 5} min`;
  }
  return 'Every time';
}

function Row({ k, v }: { k: string; v: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  big: { color: colors.text, fontSize: 48, fontWeight: '700' },
  h: { color: colors.text, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  k: { color: colors.muted, fontSize: 15 },
  v: { color: colors.text, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  flex: { flex: 1 },
});
