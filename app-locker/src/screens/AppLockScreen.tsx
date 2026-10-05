import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppRow } from '../components/AppRow';
import { useOnFocus } from '../components/Screen';
import { Banner, Button, Chip, H1, Muted, SearchBar } from '../components/ui';
import { RootParamList } from '../navigation/types';
import { onNativeEvent } from '../services/native';
import { useApp } from '../store/useApp';
import { colors } from '../theme';
import { InstalledApp } from '../types';
import { filterApps, LockFilter } from '../utils/filterApps';
import { protectionReady } from '../utils/permissions';

type Props = NativeStackScreenProps<RootParamList, 'app-lock'>;

/** Installed apps with a lock switch. The list comes from Android's PackageManager; no names are hard-coded. */
export function AppLockScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { apps, appsLoading, appsError, protectedApps, permissions } = useApp();
  const loadApps = useApp((s) => s.loadApps);
  const loadProtected = useApp((s) => s.loadProtected);
  const loadPermissions = useApp((s) => s.loadPermissions);
  const setLocked = useApp((s) => s.setLocked);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LockFilter>('all');
  const [hideSystem, setHideSystem] = useState(false);

  useEffect(() => {
    loadApps();
    return onNativeEvent('appsChanged', () => {
      loadApps();
      loadProtected();
    });
  }, [loadApps, loadProtected]);

  useOnFocus(() => {
    loadProtected().catch(() => {});
    loadPermissions().catch(() => {});
  });

  const lockedSet = useMemo(() => new Set(protectedApps.filter((p) => p.enabled).map((p) => p.packageName)), [protectedApps]);
  const data = useMemo(() => filterApps(apps, query, lockedSet, filter, hideSystem), [apps, query, lockedSet, filter, hideSystem]);

  const toggle = async (app: InstalledApp, on: boolean) => {
    try {
      const r = await setLocked(app, on);
      if (r === 'needs-pin') {
        Alert.alert('Create a PIN first', 'Set up your PIN in Security, then try again.');
      }
    } catch (e) {
      Alert.alert('Could not change the lock', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const ready = protectionReady(permissions);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.head}>
        <H1>App Lock</H1>
        <SearchBar value={query} onChange={setQuery} />
        <View style={styles.chips}>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Locked" active={filter === 'locked'} onPress={() => setFilter('locked')} />
          <Chip label="Unlocked" active={filter === 'unlocked'} onPress={() => setFilter('unlocked')} />
        </View>
        <View style={styles.sys}>
          <Text style={styles.sysText}>Hide system apps</Text>
          <Switch value={hideSystem} onValueChange={setHideSystem} trackColor={{ false: colors.surface2, true: colors.accent }} thumbColor="#fff" />
        </View>
        {permissions && !ready && (
          <Banner
            tone="warn"
            title="Monitoring is off"
            text="Your choices are saved, but apps are not locked until the Accessibility Service is on."
            action={<Button title="Open Permissions" onPress={() => navigation.navigate('permissions')} />}
          />
        )}
      </View>

      {appsLoading && !apps.length ? (
        <ActivityIndicator color={colors.accent} style={styles.center} />
      ) : appsError ? (
        <View style={styles.center}>
          <Text style={styles.err}>{appsError}</Text>
          <Button title="Try again" onPress={loadApps} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(a) => a.packageName}
          renderItem={({ item }) => (
            <AppRow app={item} locked={lockedSet.has(item.packageName)} onToggle={(on) => toggle(item, on)} />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
          initialNumToRender={20}
          ListEmptyComponent={
            <Muted style={styles.empty}>
              {query ? `No apps match "${query}".` : filter === 'locked' ? 'No apps are locked yet.' : 'No apps found.'}
            </Muted>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 20, gap: 12 },
  chips: { flexDirection: 'row', gap: 8 },
  sys: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sysText: { color: colors.muted, fontSize: 14 },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  err: { color: colors.danger },
  empty: { textAlign: 'center', marginTop: 32 },
});
