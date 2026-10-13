import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminUserStats } from '../api/hooks';
import { AppText as Text } from '../components/AppText';
import { Icon } from '../components/Icon';
import { LoadingBars } from '../components/LoadingBars';
import { colors, themedStyles } from '../theme/theme';

export function AdminScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const stats = useAdminUserStats();

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>Admin</Text>
      </View>

      <Text style={styles.muted}>
        Active means the account has used the app in the last {stats.data?.windowDays ?? 30} days.
      </Text>

      {stats.isLoading && <LoadingBars />}
      {stats.isError && <Text style={styles.error}>Couldn't load the user counts. Try again in a moment.</Text>}

      {stats.data && (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Can log in</Text>
            <Text style={styles.value}>{stats.data.total}</Text>
            <Text style={styles.muted}>Registered accounts</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Active</Text>
            <Text style={[styles.value, styles.valueActive]}>{stats.data.active}</Text>
            <Text style={styles.muted}>Used the app recently</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Inactive</Text>
            <Text style={styles.value}>{stats.data.inactive}</Text>
            <Text style={styles.muted}>No recent activity</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  card: { gap: 4, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  label: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  value: { color: colors.text, fontSize: 36, fontWeight: '700' },
  valueActive: { color: colors.accent },
}));
