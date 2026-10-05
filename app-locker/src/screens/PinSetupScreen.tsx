import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PinPad } from '../components/PinPad';
import { Screen } from '../components/Screen';
import { H1, Muted } from '../components/ui';
import { RootParamList } from '../navigation/types';
import { securityApi } from '../services/native';
import { useApp } from '../store/useApp';
import { colors } from '../theme';
import { formatWait } from '../utils/format';

type Props = NativeStackScreenProps<RootParamList, 'pin-setup'>;
type Step = 'old' | 'new' | 'confirm';

/** Change the PIN: current PIN, new PIN, confirm. The current PIN is checked with the same attempt limits as unlocking. */
export function PinSetupScreen({ navigation }: Props) {
  const settings = useApp((s) => s.settings);
  const loadSettings = useApp((s) => s.loadSettings);
  const length = settings?.pinLength ?? 6;
  const [step, setStep] = useState<Step>('old');
  const [oldPin, setOldPin] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);

  const bump = () => setReset((n) => n + 1);

  const gotOld = async (pin: string) => {
    // Verify now so a wrong old PIN is reported straight away (and counted).
    const r = await securityApi.verifyPin(pin);
    if (!r.ok) {
      setError(r.remainingMs > 0 ? `Too many attempts. Try again in ${formatWait(r.remainingMs)}` : 'Wrong PIN');
      bump();
      return;
    }
    setOldPin(pin);
    setError('');
    setStep('new');
    bump();
  };

  const gotNew = async (pin: string) => {
    const proceed = () => {
      setFirst(pin);
      setError('');
      setStep('confirm');
      bump();
    };
    if (await securityApi.isTrivialPin(pin)) {
      Alert.alert('Easy to guess', 'This PIN is easy to guess. Choose a harder one?', [
        { text: 'Choose another', onPress: bump },
        { text: 'Use it anyway', style: 'destructive', onPress: proceed },
      ]);
      return;
    }
    proceed();
  };

  const confirmed = async (pin: string) => {
    if (pin !== first) {
      setError('The PINs did not match.');
      setStep('new');
      bump();
      return;
    }
    const r = await securityApi.changePin(oldPin, pin);
    if (!r.ok) {
      setError('Could not change the PIN. Try again.');
      setStep('old');
      bump();
      return;
    }
    await loadSettings();
    Alert.alert('PIN changed', 'Your new PIN is active.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
  };

  const titles: Record<Step, string> = { old: 'Enter your current PIN', new: 'Choose a new PIN', confirm: 'Confirm the new PIN' };

  return (
    <Screen>
      <H1>Change PIN</H1>
      <Muted>{titles[step]}</Muted>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.pad}>
        <PinPad length={length} onComplete={step === 'old' ? gotOld : step === 'new' ? gotNew : confirmed} resetKey={reset} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger },
  pad: { alignItems: 'center', marginTop: 16 },
});
