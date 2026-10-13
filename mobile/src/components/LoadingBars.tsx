import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, themedStyles } from '../theme/theme';

const BAR_COUNT = 5;

/** Animated equalizer bars used wherever the app is loading something. */
export function LoadingBars({ color = colors.accent, height = 28 }: { color?: string; height?: number }) {
  const levels = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    const loops = levels.map((level, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(level, { toValue: 1, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(level, { toValue: 0.3, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [levels]);

  return (
    <View style={[styles.row, { height }]} accessibilityRole="progressbar" accessibilityLabel="Loading">
      {levels.map((level, i) => (
        <Animated.View key={i} style={[styles.bar, { backgroundColor: color, height, transform: [{ scaleY: level }] }]} />
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  bar: { width: 5, borderRadius: 3 },
}));
