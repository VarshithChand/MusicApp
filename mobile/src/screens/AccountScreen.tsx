import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { useAuth } from '../store/auth';
import { colors } from '../theme/theme';

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

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
          <Text style={styles.initial}>{(user?.name ?? '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name ?? 'Your account'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.is_admin && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Admin</Text>
          </View>
        )}
      </View>

      <Pressable style={styles.logout} onPress={confirmLogout} accessibilityRole="button" accessibilityLabel="Log out">
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  logoutText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
});
