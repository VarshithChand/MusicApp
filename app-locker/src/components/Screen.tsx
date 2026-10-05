import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/** Common page frame: dark background, safe-area padding, optional scrolling. */
export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 };
  if (!scroll) {
    return <View style={[styles.flex, styles.content, pad]}>{children}</View>;
  }
  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, pad]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Runs `fn` every time the screen comes into view (used to re-check Android permissions). */
export function useOnFocus(fn: () => void) {
  useFocusEffect(
    useCallback(() => {
      fn();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 16 },
});
