import React, { useCallback, useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad } from '../components/PinPad';
import { Button, Muted } from '../components/ui';
import { biometricApi, securityApi } from '../services/native';
import { useApp } from '../store/useApp';
import { colors } from '../theme';
import { formatWait } from '../utils/format';

/** App Locker's own lock: its settings need the PIN or fingerprint, otherwise anyone could switch the locks off. */
export function GateScreen() {
  const insets = useSafeAreaInsets();
  const settings = useApp((s) => s.settings);
  const setUnlocked = useApp((s) => s.setUnlocked);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);
  const [wait, setWait] = useState(0);
  const [bio, setBio] = useState(false);

  const tryBiometric = useCallback(async () => {
    try {
      if (await biometricApi.authenticate('Unlock App Locker')) {
        setUnlocked(true);
      }
    } catch {
      // The PIN pad is always available.
    }
  }, [setUnlocked]);

  useEffect(() => {
    securityApi.getLockoutRemaining().then(setWait).catch(() => {});
    if (settings?.biometricEnabled) {
      biometricApi
        .status()
        .then((s) => {
          if (s === 'available') {
            setBio(true);
            tryBiometric();
          }
        })
        .catch(() => {});
    }
  }, [settings?.biometricEnabled, tryBiometric]);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1000)), 1000);
    return () => clearInterval(t);
  }, [wait]);

  const check = async (pin: string) => {
    const r = await securityApi.verifyPin(pin);
    if (r.ok) {
      setUnlocked(true);
      return;
    }
    setWait(r.remainingMs);
    setError(r.remainingMs > 0 ? '' : 'Wrong PIN');
    setReset((n) => n + 1);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.title}>App Locker</Text>
      <Muted>Enter your PIN to continue</Muted>
      <Text style={styles.error}>
        {wait > 0 ? `Too many attempts. Try again in ${formatWait(wait)}` : error}
      </Text>
      <PinPad length={settings?.pinLength ?? 6} onComplete={check} disabled={wait > 0} resetKey={reset} />
      {bio && <Button title="Use fingerprint" kind="secondary" onPress={tryBiometric} style={styles.bio} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  error: { color: colors.danger, minHeight: 22, textAlign: 'center', marginVertical: 12 },
  bio: { marginTop: 24, alignSelf: 'stretch' },
});
