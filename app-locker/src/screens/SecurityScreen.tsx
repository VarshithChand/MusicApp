import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, useOnFocus } from '../components/Screen';
import { Button, Card, Chip, H1, Muted } from '../components/ui';
import { RootParamList } from '../navigation/types';
import { biometricApi } from '../services/native';
import { securityApi } from '../services/native';
import { useApp } from '../store/useApp';
import { Colors, useColors, useStyles } from '../theme';
import { BiometricStatus, ThemeMode } from '../types';

type Props = NativeStackScreenProps<RootParamList, 'security'>;

export function SecurityScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const settings = useApp((s) => s.settings);
  const loadSettings = useApp((s) => s.loadSettings);
  const [bio, setBio] = useState<BiometricStatus>('unsupported');

  useOnFocus(() => {
    biometricApi.status().then(setBio).catch(() => {});
    loadSettings().catch(() => {});
  });

  const bioAvailable = bio === 'available';

  const setBiometric = async (on: boolean) => {
    try {
      if (on) {
        // Prove it works before turning it on, so the user cannot lock themselves into a broken setup.
        const ok = await biometricApi.authenticate('Confirm your fingerprint');
        if (!ok) {
          return;
        }
      }
      await securityApi.updateSettings({ biometricEnabled: on });
      await loadSettings();
    } catch (e) {
      Alert.alert('Fingerprint', e instanceof Error ? e.message : 'Could not change this setting');
    }
  };

  const setTheme = async (mode: ThemeMode) => {
    await securityApi.updateSettings({ themeMode: mode });
    await loadSettings();
  };

  const setHideNotifications = async (on: boolean) => {
    await securityApi.updateSettings({ hideNotifications: on });
    await loadSettings();
  };

  const test = async () => {
    try {
      const ok = await biometricApi.authenticate('Test fingerprint');
      Alert.alert('Test', ok ? 'Fingerprint worked.' : 'Cancelled. Nothing was changed.');
    } catch (e) {
      Alert.alert('Test failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <Screen>
      <H1>Security</H1>

      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.h}>Fingerprint unlock</Text>
            <Muted>
              {bioAvailable
                ? 'Use your fingerprint (or strong face unlock) first. The PIN is always the backup.'
                : bio === 'none_enrolled'
                ? 'Add a fingerprint in Android Settings first.'
                : 'Not available on this phone. The PIN is used.'}
            </Muted>
          </View>
          <Switch
            value={!!settings?.biometricEnabled}
            onValueChange={setBiometric}
            disabled={!bioAvailable}
            trackColor={{ false: colors.surface2, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>
        <Button title="Test fingerprint" kind="secondary" onPress={test} disabled={!bioAvailable} />
      </Card>

      <Card>
        <Text style={styles.h}>Appearance</Text>
        <Muted>Applies to the app and to the lock screen.</Muted>
        <View style={styles.chips}>
          {(['SYSTEM', 'LIGHT', 'DARK'] as const).map((m) => (
            <Chip
              key={m}
              label={m === 'SYSTEM' ? 'System' : m === 'LIGHT' ? 'Light' : 'Dark'}
              active={settings?.themeMode === m}
              onPress={() => setTheme(m)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.h}>Hide notification text</Text>
            <Muted>
              For locked apps, show "Unlock to read it" instead of the message. Needs Notification access, which you can
              switch on in Permissions & Protection. Calls and alarms are never touched.
            </Muted>
          </View>
          <Switch
            value={settings?.hideNotifications ?? true}
            onValueChange={setHideNotifications}
            trackColor={{ false: colors.surface2, true: colors.accent }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.h}>PIN</Text>
        <Muted>Used when the fingerprint fails or is off. It is stored scrambled, never as plain text.</Muted>
        <Button title="Change PIN" kind="secondary" onPress={() => navigation.navigate('pin-setup')} />
      </Card>

      <Card>
        <Text style={styles.h}>Wrong PIN attempts</Text>
        <Muted>
          After 5 wrong tries the PIN pad locks for 30 seconds, then 1, 5, 15 and 30 minutes. Restarting the app or the
          phone does not reset this.
        </Muted>
      </Card>
    </Screen>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, gap: 4 },
  h: { color: colors.text, fontSize: 17, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8 },
});
