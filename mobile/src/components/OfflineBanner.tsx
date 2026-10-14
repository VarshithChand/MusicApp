import React from 'react';
import { View } from 'react-native';
import { AppText as Text } from './AppText';
import { useNetwork } from '../store/network';
import { colors, themedStyles } from '../theme/theme';

/** Says why the app moved the listener to their own files, so the jump isn't a mystery. */
export function OfflineBanner() {
  const offline = useNetwork((s) => s.offline);
  if (!offline) return null;
  return (
    <View style={styles.bar}>
      <Text style={styles.text}>You're offline. These are the songs and videos already on this phone.</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  bar: { backgroundColor: colors.surface2, paddingHorizontal: 16, paddingVertical: 8 },
  text: { color: colors.muted, fontSize: 12 },
}));
