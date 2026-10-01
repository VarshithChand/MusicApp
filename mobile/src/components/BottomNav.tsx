import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/theme';
import { Icon, IconName } from './Icon';
import { MiniPlayer } from './MiniPlayer';

const TABS: Record<string, { label: string; icon: IconName }> = {
  Home: { label: 'Home', icon: 'home' },
  Search: { label: 'Search', icon: 'search' },
  Library: { label: 'Library', icon: 'library' },
};

/** Tab bar with the mini player stacked above it. */
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.bg }}>
      <MiniPlayer />
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          const active = state.index === i;
          const color = active ? colors.accent : colors.muted;
          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => !active && navigation.navigate(route.name)}
            >
              <Icon name={tab.icon} color={color} />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.surface2 },
  tab: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 11, fontWeight: '600' },
});
