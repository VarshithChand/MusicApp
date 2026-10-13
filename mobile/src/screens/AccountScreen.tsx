import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { useAuth } from '../store/auth';
import { colors, themedStyles } from '../theme/theme';

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const setGender = useAuth((s) => s.setGender);

  const changeGender = async (g: 'male' | 'female') => {
    if (user?.gender === g) return;
    try {
      await setGender(g);
    } catch {
      Alert.alert("Couldn't save", 'Try again in a moment.');
    }
  };

  const confirmLogout = () =>
    Alert.alert('Log out?', 'You will need to log in again to listen.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);

  return (
    <View style={[styles.flex, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={26} color={colors.text} />
        </Pressable>
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

      <View style={styles.genderSection}>
        <Text style={styles.genderLabel}>Gender</Text>
        <View style={styles.genderRow}>
          {(['male', 'female'] as const).map((g) => {
            const on = user?.gender === g;
            return (
              <Pressable
                key={g}
                style={[styles.genderBtn, on && styles.genderBtnOn]}
                onPress={() => changeGender(g)}
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

      <Pressable style={styles.logout} onPress={confirmLogout} accessibilityRole="button" accessibilityLabel="Log out">
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  profile: { alignItems: 'center', gap: 6, marginTop: 24, flex: 1 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  initial: { color: colors.onAccent, fontSize: 40, fontWeight: '700' },
  name: { color: colors.text, fontSize: 24, fontWeight: '700' },
  email: { color: colors.muted, fontSize: 15 },
  badge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.surface2 },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  logout: { height: 54, borderRadius: 27, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  genderSection: { gap: 10, alignSelf: 'stretch' },
  genderLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  genderBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  genderText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  genderTextOn: { color: colors.onAccent },
  logoutText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
}));
