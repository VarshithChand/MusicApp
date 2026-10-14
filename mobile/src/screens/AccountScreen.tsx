import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { Icon } from '../components/Icon';
import { DateField } from '../components/DateField';
import { GENRES } from '../data/genres';
import { LANGUAGES, languageLabel } from '../data/languages';
import { TASTES } from '../data/tastes';
import { useAuth } from '../store/auth';
import { colors, themedStyles } from '../theme/theme';

const MAX_CHANGES = 2;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDob(v?: string | null): string {
  if (!v) return 'Not set';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]} ${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}` : v;
}

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const updatePreferences = useAuth((s) => s.updatePreferences);

  const [editing, setEditing] = useState(false);
  const [gender, setGender] = useState<'male' | 'female' | null>(user?.gender ?? null);
  const [tastes, setTastes] = useState<string[]>(user?.song_tastes ?? []);
  const [dob, setDob] = useState<string>(user?.date_of_birth ?? '');
  const [genres, setGenres] = useState<string[]>(user?.genres ?? []);
  const [languages, setLanguages] = useState<string[]>(user?.languages ?? []);
  const [saving, setSaving] = useState(false);

  const changes = user?.taste_changes ?? 0;
  const locked = changes >= MAX_CHANGES;
  const tasteLabels = (user?.song_tastes ?? []).map((k) => TASTES.find((t) => t.key === k)?.label ?? k);

  const startEdit = () => {
    setGender(user?.gender ?? null);
    setTastes(user?.song_tastes ?? []);
    setDob(user?.date_of_birth ?? '');
    setGenres(user?.genres ?? []);
    setLanguages(user?.languages ?? []);
    setEditing(true);
  };

  const save = async () => {
    const current = user?.song_tastes ?? [];
    const tastesChanged = !locked && (tastes.length !== current.length || tastes.some((t) => !current.includes(t)));
    setSaving(true);
    try {
      const dobChanged = !!dob && dob !== (user?.date_of_birth ?? '');
      await updatePreferences({
        gender: gender ?? undefined,
        ...(tastesChanged ? { songTastes: tastes } : {}),
        ...(dobChanged ? { dateOfBirth: dob } : {}),
        genres,
        languages,
      });
      setEditing(false);
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need to log in again to listen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Account</Text>
        <View style={styles.flex1} />
        {!editing && (
          <Pressable style={styles.editBtn} onPress={startEdit} accessibilityRole="button" accessibilityLabel="Edit">
            <Text style={styles.editText}>Edit</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.profile}>
        <View style={styles.avatar}>
          {user?.gender ? (
            <Icon name={user.gender} size={44} color={colors.onAccent} />
          ) : (
            <Text style={styles.initial}>{(user?.name ?? '?').trim().charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text style={styles.name}>{user?.name ?? 'Your account'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.is_admin && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Admin</Text>
          </View>
        )}
      </View>

      {!editing && (
        <View style={styles.card}>
          <Text style={styles.label}>Gender</Text>
          <Text style={styles.value}>{user?.gender ? (user.gender === 'male' ? 'Male' : 'Female') : 'Not set'}</Text>
          <Text style={styles.label}>Date of birth</Text>
          <Text style={styles.value}>{formatDob(user?.date_of_birth)}</Text>
          <Text style={styles.label}>Languages</Text>
          <Text style={styles.value}>
            {(user?.languages ?? []).length ? (user?.languages ?? []).map(languageLabel).join(', ') : 'All languages'}
          </Text>
          <Text style={styles.label}>Genres</Text>
          <Text style={styles.value}>
            {(user?.genres ?? []).length ? (user?.genres ?? []).map((k) => GENRES.find((g) => g.key === k)?.label ?? k).join(', ') : 'Not set'}
          </Text>
          <Text style={styles.label}>Song types</Text>
          <Text style={styles.value}>{tasteLabels.length ? tasteLabels.join(', ') : 'Default'}</Text>
          {locked && <Text style={styles.muted}>Your song types are now the default and can't be changed.</Text>}
        </View>
      )}

      {editing && (
        <View style={styles.card}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.row}>
            {(['male', 'female'] as const).map((g) => {
              const on = gender === g;
              return (
                <Pressable
                  key={g}
                  style={[styles.pill, on && styles.pillOn]}
                  onPress={() => setGender(g)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Icon name={g} size={18} color={on ? colors.onAccent : colors.text} />
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>{g === 'male' ? 'Male' : 'Female'}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Languages</Text>
          <Text style={styles.muted}>Home, YouTube and search stay in these. Pick none to hear everything.</Text>
          <View style={styles.row}>
            {LANGUAGES.map((l) => {
              const on = languages.includes(l.key);
              return (
                <Pressable
                  key={l.key}
                  style={[styles.pill, on && styles.pillOn]}
                  onPress={() => setLanguages(on ? languages.filter((k) => k !== l.key) : [...languages, l.key])}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Genres</Text>
          <View style={styles.row}>
            {GENRES.map((g) => {
              const on = genres.includes(g.key);
              return (
                <Pressable
                  key={g.key}
                  style={[styles.pill, on && styles.pillOn]}
                  onPress={() => setGenres(on ? genres.filter((k) => k !== g.key) : [...genres, g.key])}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>{g.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <DateField label="Date of birth" value={dob} onChange={setDob} />

          <Text style={styles.label}>Song types you like</Text>
          {locked ? (
            <Text style={styles.muted}>Your song types are now the default and can't be changed.</Text>
          ) : (
            <>
              <View style={styles.row}>
                {TASTES.map((t) => {
                  const on = tastes.includes(t.key);
                  return (
                    <Pressable
                      key={t.key}
                      style={[styles.pill, on && styles.pillOn]}
                      onPress={() => setTastes(on ? tastes.filter((k) => k !== t.key) : [...tastes, t.key])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.pillText, on && styles.pillTextOn]}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.muted}>
                You can change your song types {MAX_CHANGES - changes} more time{MAX_CHANGES - changes === 1 ? '' : 's'}. After
                that they go back to the default.
              </Text>
            </>
          )}

          <View style={styles.row}>
            <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={save} disabled={saving} accessibilityRole="button">
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Pressable style={styles.logout} onPress={confirmLogout} accessibilityRole="button" accessibilityLabel="Log out">
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  editBtn: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  editText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  profile: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  initial: { color: colors.onAccent, fontSize: 40, fontWeight: '700' },
  name: { color: colors.text, fontSize: 22, fontWeight: '700' },
  email: { color: colors.muted, fontSize: 14 },
  badge: { marginTop: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.surface2 },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  card: { gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 4 },
  value: { color: colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pillTextOn: { color: colors.onAccent },
  saveBtn: { height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
  cancelBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  logout: { height: 54, borderRadius: 27, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
}));
