import React, { useEffect, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Screen } from '../components/Screen';
import { Card, H1, Muted } from '../components/ui';
import { permissionsApi } from '../services/native';
import { colors } from '../theme';

export function AboutScreen() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    permissionsApi
      .getAppInfo()
      .then((i) => setVersion(`${i.versionName} (build ${i.versionCode})`))
      .catch(() => setVersion('unknown'));
  }, []);

  return (
    <Screen>
      <H1>About</H1>
      <Muted>Version {version}</Muted>

      <Card>
        <Text style={styles.h}>Privacy</Text>
        <Text style={styles.p}>
          Everything stays on this phone. App Locker has no internet permission, no account, no analytics and no
          crash reporting, so it cannot send your app list, PIN or fingerprint anywhere. Your fingerprint is handled
          by Android itself; App Locker only learns "yes" or "no". Your PIN is stored scrambled with a key held by
          Android's secure key store.
        </Text>
      </Card>

      <Card>
        <Text style={styles.h}>What the Accessibility Service sees</Text>
        <Text style={styles.p}>
          Only the name of the app and screen that came to the front. It is set up so that it cannot read what is on the
          screen.
        </Text>
      </Card>

      <Card>
        <Text style={styles.h}>Limits you should know</Text>
        <Text style={styles.p}>
          • This keeps casual snoopers out. It is not unbreakable.{'\n'}• If the Accessibility Service is turned off, or
          App Locker is force-stopped or uninstalled, apps are no longer locked.{'\n'}• An app can show for a split
          second before the lock appears.{'\n'}• Android Settings, the installer and other system screens cannot be
          reliably locked, and App Locker does not try to get around any Android security feature.{'\n'}• If you
          forget your PIN there is no reset: reinstalling clears all locks.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { color: colors.text, fontSize: 16, fontWeight: '700' },
  p: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
