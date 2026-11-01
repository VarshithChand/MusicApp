import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { AppText as Text } from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { DateField } from '../components/DateField';
import { GENRES } from '../data/genres';
import { LANGUAGES } from '../data/languages';
import { TASTES } from '../data/tastes';
import { useAuth } from '../store/auth';
import { colors, themedStyles } from '../theme/theme';

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [tastes, setTastes] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const focusedNode = useRef<ViewNode | null>(null);

  const isLogin = mode === 'login';
  const passwordsMatch = isLogin || password === confirm;
  const dobValid = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) && !Number.isNaN(new Date(`${dateOfBirth}T00:00:00Z`).getTime());
  const step1Valid = !!name.trim() && !!email.trim() && password.length >= 8 && passwordsMatch;
  const step2Valid = !!gender && dobValid;
  const canSubmit = isLogin
    ? !!email.trim() && password.length >= 1
    : step === 1
      ? step1Valid
      : step2Valid;

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
    if (!isLogin && step === 1) {
      setStep(2);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setBusy(true);
    try {
      if (isLogin) await login(email.trim(), password);
      else if (gender) await register(name.trim(), email.trim(), password, gender, tastes, dateOfBirth, genres, languages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setError(null);
    setConfirm('');
    setStep(1);
    setMode(isLogin ? 'register' : 'login');
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

  const showAccountStep = isLogin || step === 1;
  const showDetailsStep = !isLogin && step === 2;

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
        <Text style={styles.lead}>
          {isLogin
            ? 'Log in to pick up where you left off.'
            : step === 1
              ? 'Step 1 of 2: your name and sign-in details.'
              : 'Step 2 of 2: tell us about your music taste.'}
        </Text>

        <View style={styles.form}>
          {showAccountStep && !isLogin && (
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoComplete="name"
              onFieldFocus={onFieldFocus}
            />
          )}

          {showAccountStep && (
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
          )}
          {showAccountStep && (
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
          )}
          {showAccountStep && !isLogin && (
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
          {showAccountStep && !isLogin && confirm.length > 0 && !passwordsMatch && (
            <Text style={styles.error}>Passwords don't match.</Text>
          )}

          {showDetailsStep && (
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

          {showDetailsStep && <DateField label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} />}

          {showDetailsStep && (
            <View style={styles.field}>
              <Text style={styles.label}>Song types you like (optional)</Text>
              <View style={styles.tasteRow}>
                {TASTES.map((t) => {
                  const on = tastes.includes(t.key);
                  return (
                    <Pressable
                      key={t.key}
                      style={[styles.tasteChip, on && styles.genderBtnOn]}
                      onPress={() => setTastes(on ? tastes.filter((k) => k !== t.key) : [...tastes, t.key])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.genderText, on && styles.genderTextOn]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {showDetailsStep && (
            <View style={styles.field}>
              <Text style={styles.label}>Languages you listen in (optional)</Text>
              <Text style={styles.hint}>Home, YouTube and search stay in these. Leave it empty to hear everything.</Text>
              <View style={styles.tasteRow}>
                {LANGUAGES.map((l) => {
                  const on = languages.includes(l.key);
                  return (
                    <Pressable
                      key={l.key}
                      style={[styles.tasteChip, on && styles.genderBtnOn]}
                      onPress={() => setLanguages(on ? languages.filter((k) => k !== l.key) : [...languages, l.key])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.genderText, on && styles.genderTextOn]}>{l.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {showDetailsStep && (
            <View style={styles.field}>
              <Text style={styles.label}>Genres you listen to (optional)</Text>
              <View style={styles.tasteRow}>
                {GENRES.map((g) => {
                  const on = genres.includes(g.key);
                  return (
                    <Pressable
                      key={g.key}
                      style={[styles.tasteChip, on && styles.genderBtnOn]}
                      onPress={() => setGenres(on ? genres.filter((k) => k !== g.key) : [...genres, g.key])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.genderText, on && styles.genderTextOn]}>{g.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
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
              <Text style={styles.buttonText}>{isLogin ? 'Log in' : step === 1 ? 'Next' : 'Create account'}</Text>
            )}
          </Pressable>
          {showDetailsStep && (
            <Pressable style={styles.backBtn} onPress={() => setStep(1)} accessibilityRole="button">
              <Text style={styles.link}>Back</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.switch}>
          <Text style={styles.switchText}>{isLogin ? 'New here?' : 'Already have an account?'}</Text>
          <Pressable onPress={switchMode} style={styles.switchButton}>
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
  tasteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tasteChip: { paddingHorizontal: 14, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
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
  hint: { color: colors.muted, fontSize: 12, marginTop: 2 },
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
  backBtn: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  switch: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 'auto' },
  switchText: { color: colors.muted, fontSize: 15 },
  switchButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.accent, fontSize: 15, fontWeight: '600' },
}));
