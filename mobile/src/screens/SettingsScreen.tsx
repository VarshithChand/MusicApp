import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { Icon } from '../components/Icon';
import { useAuth } from '../store/auth';
import { colors, themedStyles } from '../theme/theme';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuth((s) => s.user);
  const isAdmin = !!user?.is_admin;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.h1}>Settings</Text>

      <Pressable style={styles.row} onPress={() => navigation.navigate('Account')} accessibilityRole="button">
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{user?.name ?? 'Your account'}</Text>
          <Text style={styles.muted}>{user?.email ?? 'Profile and log out'}</Text>
        </View>
        <View style={styles.chevron}>
          <Icon name="back" size={20} color={colors.muted} />
        </View>
      </Pressable>

      <Pressable style={styles.row} onPress={() => navigation.navigate('Appearance')} accessibilityRole="button">
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Appearance</Text>
          <Text style={styles.muted}>Look, theme, font and text size</Text>
        </View>
        <View style={styles.chevron}>
          <Icon name="back" size={20} color={colors.muted} />
        </View>
      </Pressable>

      <Pressable style={styles.row} onPress={() => navigation.navigate('VolumeBoost')} accessibilityRole="button">
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>Volume boost</Text>
          <Text style={styles.muted}>Make music play louder</Text>
        </View>
        <View style={styles.chevron}>
          <Icon name="back" size={20} color={colors.muted} />
        </View>
      </Pressable>

      {isAdmin && (
        <>
          <Text style={styles.h2}>Admin</Text>
          <Pressable style={styles.row} onPress={() => navigation.navigate('Admin')} accessibilityRole="button">
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>User activity</Text>
              <Text style={styles.muted}>Accounts that can log in, active and inactive</Text>
            </View>
            <View style={styles.chevron}>
            <Icon name="back" size={20} color={colors.muted} />
          </View>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, marginBottom: 8 },
  h2: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 },
  muted: { color: colors.muted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowText: { flex: 1, gap: 4 },
  chevron: { transform: [{ rotate: '180deg' }] },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
}));
