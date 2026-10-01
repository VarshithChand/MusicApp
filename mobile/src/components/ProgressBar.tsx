import React, { useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme/theme';

interface Props {
  /** 0..1 */
  value: number;
  onSeek?: (fraction: number) => void;
  color?: string;
  thumb?: boolean;
}

/** A thin bar; when `onSeek` is given, tapping it jumps to that point. */
export function ProgressBar({ value, onSeek, color = colors.accent, thumb }: Props) {
  const [width, setWidth] = useState(0);
  const pct = `${Math.min(Math.max(value, 0), 1) * 100}%` as `${number}%`;

  const bar = (
    <View style={styles.hit} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.track} />
      <View style={[styles.fill, { width: pct, backgroundColor: color }]} />
      {thumb && <View style={[styles.thumb, { left: pct }]} />}
    </View>
  );
  if (!onSeek) return bar;
  return (
    <Pressable
      accessibilityRole="adjustable"
      onPress={(e: GestureResponderEvent) => width > 0 && onSeek(e.nativeEvent.locationX / width)}
    >
      {bar}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { height: 24, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: colors.track },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2 },
  thumb: { position: 'absolute', width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: colors.text },
});
