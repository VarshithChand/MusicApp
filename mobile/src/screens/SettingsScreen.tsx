import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminMyInfo } from '../api/hooks';
import { AppText as Text } from '../components/AppText';
import { Icon } from '../components/Icon';
import { useAuth } from '../store/auth';
import { colors, themedStyles } from '../theme/theme';

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuth((s) => s.user);
  const isAdmin = !!user?.is_admin;
  const adminInfo = useAdminMyInfo();

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

          {/* Admin Session Details Card: User Name, IP & Location */}
          <View style={styles.sessionCard}>
            <View style={styles.sessionHeader}>
              <View style={styles.sessionIconWrap}>
                <Icon name="user" size={18} color={colors.accent} />
              </View>
              <View style={styles.sessionHeaderText}>
                <Text style={styles.sessionTitle}>Admin Session</Text>
                <Text style={styles.sessionSub}>Device and network identity</Text>
              </View>
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Active</Text>
              </View>
            </View>

            <View style={styles.sessionDivider} />

            <View style={styles.sessionRow}>
              <View style={styles.sessionLabelCol}>
                <Icon name="user" size={14} color={colors.muted} />
                <Text style={styles.sessionLabel}>Name</Text>
              </View>
              <Text style={styles.sessionValue} numberOfLines={1}>
                {adminInfo.data?.name || user?.name || 'Loading...'}
              </Text>
            </View>

            <View style={styles.sessionRow}>
              <View style={styles.sessionLabelCol}>
                <Icon name="globe" size={14} color={colors.muted} />
                <Text style={styles.sessionLabel}>IP Address</Text>
              </View>
              <Text style={styles.sessionValueMono} numberOfLines={1}>
                {adminInfo.isLoading ? 'Detecting...' : (adminInfo.data?.ip ?? 'Unknown')}
              </Text>
            </View>

            <View style={styles.sessionRow}>
              <View style={styles.sessionLabelCol}>
                <Icon name="pin" size={14} color={colors.muted} />
                <Text style={styles.sessionLabel}>Location</Text>
              </View>
              <Text style={styles.sessionValue} numberOfLines={1}>
                {adminInfo.isLoading ? 'Resolving...' : (adminInfo.data?.location ?? 'Unknown')}
              </Text>
            </View>
          </View>

          <Pressable style={styles.row} onPress={() => navigation.navigate('Admin')} accessibilityRole="button">
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>User activity</Text>
              <Text style={styles.muted}>Accounts that can log in, active and inactive</Text>
            </View>
            <View style={styles.chevron}>
              <Icon name="back" size={20} color={colors.muted} />
            </View>
          </Pressable>

          <Pressable style={styles.row} onPress={() => navigation.navigate('VideoImport')} accessibilityRole="button">
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Video import</Text>
              <Text style={styles.muted}>Fill the home rows with videos found by an AI</Text>
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

  // Admin Session Info Card
  sessionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sessionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 166, 35, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionHeaderText: {
    flex: 1,
    gap: 2,
  },
  sessionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sessionSub: {
    color: colors.muted,
    fontSize: 12,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.25)',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  onlineText: {
    color: '#34C759',
    fontSize: 11,
    fontWeight: '700',
  },
  sessionDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  sessionLabelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  sessionValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },
  sessionValueMono: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '55%',
    textAlign: 'right',
  },
}));
