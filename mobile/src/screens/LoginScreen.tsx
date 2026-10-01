import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { useAuth } from '../store/auth';
import { colors } from '../theme/theme';

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLogin = mode === 'login';
  const canSubmit = !!email.trim() && password.length >= (isLogin ? 1 : 8) && (isLogin || !!name.trim());

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (isLogin) await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Icon name="play" size={28} color={colors.onAccent} />
        </View>
        <Text style={styles.h1}>{isLogin ? 'Your music,\neverywhere.' : 'Create your\naccount.'}</Text>
        <Text style={styles.lead}>{isLogin ? 'Log in to pick up where you left off.' : 'It only takes a moment.'}</Text>

        <View style={styles.form}>
          {!isLogin && (
            <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" />
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="password"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, (!canSubmit || busy) && styles.disabled]}
            onPress={submit}
            disabled={!canSubmit || busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.buttonText}>{isLogin ? 'Log in' : 'Create account'}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.switch}>
          <Text style={styles.switchText}>{isLogin ? 'New here?' : 'Already have an account?'}</Text>
          <Pressable
            onPress={() => {
              setError(null);
              setMode(isLogin ? 'register' : 'login');
            }}
            style={styles.switchButton}
          >
            <Text style={styles.link}>{isLogin ? 'Create an account' : 'Log in'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...input }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...input} placeholderTextColor="#7C8391" style={styles.input} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 24, gap: 20 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  h1: { color: colors.text, fontSize: 40, fontWeight: '700', lineHeight: 44, letterSpacing: -0.8, marginTop: 12 },
  lead: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  form: { gap: 16, marginTop: 16 },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '500' },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14 },
  button: { height: 54, borderRadius: 27, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  switch: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 'auto' },
  switchText: { color: colors.muted, fontSize: 15 },
  switchButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
