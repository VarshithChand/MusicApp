import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { PinPad } from '../components/PinPad';
import { Screen } from '../components/Screen';
import { Button, Card, Chip, H1, Muted } from '../components/ui';
import { biometricApi, securityApi } from '../services/native';
import { useApp } from '../store/useApp';
import { Colors, useColors, useStyles } from '../theme';

type Step = 'welcome' | 'pin' | 'confirm' | 'bio';

/** First run: explain, create the PIN once, optionally enable the fingerprint. After this no PIN is asked per app. */
export function OnboardingScreen() {
  const styles = useStyles(makeStyles);
  const [step, setStep] = useState<Step>('welcome');
  const [length, setLength] = useState(6);
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);
  const [bioAvailable, setBioAvailable] = useState(false);
  const setUnlocked = useApp((s) => s.setUnlocked);
  const loadSettings = useApp((s) => s.loadSettings);

  const finish = async () => {
    setUnlocked(true); // before the settings reload, so the locker's own gate does not appear straight after setup
    await loadSettings();
  };

  const created = async (pin: string) => {
    if (await securityApi.isTrivialPin(pin)) {
      Alert.alert('Easy to guess', 'This PIN is easy to guess (like 1111 or 1234). Choose a harder one?', [
        { text: 'Choose another', onPress: () => setReset((n) => n + 1) },
        {
          text: 'Use it anyway',
          style: 'destructive',
          onPress: () => {
            setFirst(pin);
            setStep('confirm');
            setReset((n) => n + 1);
          },
        },
      ]);
      return;
    }
    setFirst(pin);
    setError('');
    setStep('confirm');
    setReset((n) => n + 1);
  };

  const confirmed = async (pin: string) => {
    if (pin !== first) {
      setError('The PINs did not match. Start again.');
      setFirst('');
      setStep('pin');
      setReset((n) => n + 1);
      return;
    }
    try {
      await securityApi.setPin(pin);
      setError('');
      const status = await biometricApi.status();
      if (status === 'available') {
        setBioAvailable(true);
        setStep('bio');
      } else {
        await finish();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the PIN');
      setStep('pin');
      setReset((n) => n + 1);
    }
  };

  const enableBiometric = async () => {
    try {
      if (await biometricApi.authenticate('Confirm your fingerprint')) {
        await securityApi.updateSettings({ biometricEnabled: true });
      }
    } catch {
      // Not enabled; the PIN still works.
    }
    await finish();
  };

  if (step === 'welcome') {
    return (
      <Screen>
        <H1>App Locker</H1>
        <Muted>Choose apps and protect them with your fingerprint or a PIN.</Muted>
        <Card>
          <Text style={styles.h}>How it works</Text>
          <Text style={styles.p}>
            • You create one PIN now. After that you never type a PIN just to lock another app.{'\n'}• You turn on an
            Android setting called Accessibility so App Locker can tell which app is open. It reads only the app name,
            never what is on your screen.{'\n'}• Nothing leaves your phone. This app has no internet access.
          </Text>
        </Card>
        <Card>
          <Text style={styles.h}>Please know</Text>
          <Text style={styles.p}>
            This keeps casual snoopers out. It is not unbreakable: if the Accessibility setting is turned off, or
            App Locker is force-stopped or uninstalled, apps are no longer locked. Some phone makers need extra battery
            settings, shown on the Permissions screen.
          </Text>
        </Card>
        <Button title="Create my PIN" onPress={() => setStep('pin')} />
      </Screen>
    );
  }

  if (step === 'bio') {
    return (
      <Screen>
        <H1>Use your fingerprint?</H1>
        <Muted>Unlock apps with your fingerprint. The PIN always works as a backup.</Muted>
        {bioAvailable && <Button title="Enable fingerprint" onPress={enableBiometric} />}
        <Button title="Skip for now" kind="secondary" onPress={finish} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>{step === 'pin' ? 'Create a PIN' : 'Confirm your PIN'}</H1>
      <Muted>{step === 'pin' ? `Choose ${length} digits.` : 'Enter the same PIN again.'}</Muted>
      {step === 'pin' && (
        <View style={styles.chips}>
          {[4, 6, 8].map((n) => (
            <Chip key={n} label={`${n} digits`} active={length === n} onPress={() => setLength(n)} />
          ))}
        </View>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.pad}>
        <PinPad length={length} onComplete={step === 'pin' ? created : confirmed} resetKey={reset} />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  h: { color: colors.text, fontSize: 16, fontWeight: '700' },
  p: { color: colors.text, fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', gap: 8 },
  error: { color: colors.danger },
  pad: { alignItems: 'center', marginTop: 16 },
});
