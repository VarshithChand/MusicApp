import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, themedStyles } from '../theme/theme';
import { Icon } from './Icon';
import { LoadingBars } from './LoadingBars';

/** Shown each time the app opens: the logo springs in, then fades out to reveal the app. */
export function SplashAnimation({ onDone }: { onDone: () => void }) {
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logoScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.delay(400),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => doneRef.current());
  }, [logoScale, overlayOpacity]);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
      <Animated.View style={[styles.logo, { transform: [{ scale: logoScale }] }]}>
        <Icon name="play" size={36} color={colors.onAccent} />
      </Animated.View>
      <LoadingBars height={22} />
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 28 },
  logo: { width: 88, height: 88, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
}));
