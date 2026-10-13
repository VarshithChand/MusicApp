import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { AppText as Text } from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { useAuth } from '../store/auth';
import { colors, themedStyles } from '../theme/theme';

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const focusedNode = useRef<ViewNode | null>(null);

  const isLogin = mode === 'login';
  const passwordsMatch = isLogin || password === confirm;
  const canSubmit =
    !!email.trim() && password.length >= (isLogin ? 1 : 8) && (isLogin || (!!name.trim() && !!gender)) && passwordsMatch;

  const scrollFocusedAboveKeyboard = () => {
    const node = focusedNode.current;
    const top = keyboardTop.current;
    if (!node || top == null) return;
    node.measureInWindow((_x, y, _w, h) => {
      const overlap = y + h + 16 - top;
      if (overlap > 0) scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
    });
  };

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardHeight === 0) return;
    const timer = setTimeout(scrollFocusedAboveKeyboard, 50);
    return () => clearTimeout(timer);
  }, [keyboardHeight]);

  const onFieldFocus = (node: ViewNode | null) => {
    focusedNode.current = node;
    scrollFocusedAboveKeyboard();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (isLogin) await login(email.trim(), password);
      else if (gender) await register(name.trim(), email.trim(), password, gender);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const eyeButton = (
    <Pressable
      style={styles.eyeButton}
      onPress={() => setShowPassword((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
      accessibilityState={{ checked: showPassword }}
    >
      <Icon name={showPassword ? 'eyeOff' : 'eye'} size={22} color={colors.muted} />
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 + keyboardHeight }]}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View style={styles.logo}>
          <Icon name="play" size={28} color={colors.onAccent} />
        </View>
        <Text style={styles.h1}>{isLogin ? 'Your music,\neverywhere.' : 'Create your\naccount.'}</Text>
        <Text style={styles.lead}>{isLogin ? 'Log in to pick up where you left off.' : 'It only takes a moment.'}</Text>

        <View style={styles.form}>
          {!isLogin && (
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoComplete="name"
              onFieldFocus={onFieldFocus}
            />
          )}
          {!isLogin && (
            <View style={styles.field}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.genderRow}>
                {(['male', 'female'] as const).map((g) => {
                  const on = gender === g;
                  return (
                    <Pressable
                      key={g}
                      style={[styles.genderBtn, on && styles.genderBtnOn]}
                      onPress={() => setGender(g)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Icon name={g} size={20} color={on ? colors.onAccent : colors.text} />
                      <Text style={[styles.genderText, on && styles.genderTextOn]}>{g === 'male' ? 'Male' : 'Female'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            onFieldFocus={onFieldFocus}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry={!showPassword}
            autoComplete="password"
            trailing={eyeButton}
            onFieldFocus={onFieldFocus}
          />
          {!isLogin && (
            <Field
              label="Re-enter password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Type the same password again"
              secureTextEntry={!showPassword}
              autoComplete="password"
              trailing={eyeButton}
              onFieldFocus={onFieldFocus}
            />
          )}
          {!isLogin && confirm.length > 0 && !passwordsMatch && (
            <Text style={styles.error}>Passwords don't match.</Text>
          )}
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
              setConfirm('');
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

type ViewNode = React.ComponentRef<typeof View>;

function Field({
  label,
  trailing,
  onFieldFocus,
  ...input
}: {
  label: string;
  trailing?: React.ReactNode;
  onFieldFocus: (node: ViewNode | null) => void;
} & React.ComponentProps<typeof TextInput>) {
  const box = useRef<ViewNode>(null);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View ref={box} style={styles.inputRow}>
        <TextInput
          {...input}
          placeholderTextColor="#7C8391"
          style={styles.input}
          accessibilityLabel={label}
          onFocus={() => onFieldFocus(box.current)}
        />
        {trailing}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  genderBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  genderText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  genderTextOn: { color: colors.onAccent },
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 24, gap: 20 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  h1: { color: colors.text, fontSize: 40, fontWeight: '700', lineHeight: 44, letterSpacing: -0.8, marginTop: 12 },
  lead: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  form: { gap: 16, marginTop: 16 },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingRight: 4,
  },
  input: { flex: 1, height: 52, paddingHorizontal: 16, color: colors.text, fontSize: 16 },
  eyeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 14 },
  button: { height: 54, borderRadius: 27, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  switch: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 'auto' },
  switchText: { color: colors.muted, fontSize: 15 },
  switchButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.accent, fontSize: 15, fontWeight: '600' },
}));
