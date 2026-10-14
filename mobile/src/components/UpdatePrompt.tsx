import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';
import { AppText as Text } from './AppText';
import { downloadUpdate, findUpdate, installUpdate, onDownloadProgress, Release } from '../native/appUpdate';
import { colors, themedStyles } from '../theme/theme';
import { Icon } from './Icon';

type Stage = 'offer' | 'downloading' | 'ready' | 'failed';

/**
 * Offers a new version when one has been published, and fetches it on the spot.
 *
 * Android still asks the owner before anything is installed -- this only gets the file there and
 * hands it over, so the last word stays with whoever is holding the phone.
 */
export function UpdatePrompt() {
  const [release, setRelease] = useState<Release | null>(null);
  const [stage, setStage] = useState<Stage>('offer');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileUri = useRef<string | null>(null);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    findUpdate().then(setRelease);
  }, []);

  // A bar that keeps moving while the download does, so a slow connection still looks alive.
  useEffect(() => {
    if (stage !== 'downloading') return;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    sweep.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [stage, sweep]);

  useEffect(() => onDownloadProgress(setProgress), []);

  if (!release) return null;

  const start = async () => {
    setStage('downloading');
    setError(null);
    try {
      fileUri.current = await downloadUpdate(release.apkUrl);
      setProgress(1);
      setStage('ready');
      await installUpdate(fileUri.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The update couldn't be downloaded.");
      setStage('failed');
    }
  };

  const percent = Math.round(progress * 100);
  const shimmer = sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 320] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setRelease(null)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <Icon name="download" size={26} color={colors.onAccent} />
          </View>

          <Text style={styles.title}>Version {release.version} is out</Text>

          {stage === 'offer' && (
            <>
              <Text style={styles.body}>
                {release.notes.trim().split('\n')[0] || 'A newer version of Musica is ready to install.'}
              </Text>
              <Pressable style={styles.primary} onPress={start} accessibilityLabel={`Download version ${release.version}`}>
                <Text style={styles.primaryText}>Download</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => setRelease(null)} accessibilityLabel="Not now">
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
            </>
          )}

          {stage === 'downloading' && (
            <>
              <Text style={styles.body}>Downloading… {percent}%</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(4, percent)}%` }]} />
                <Animated.View style={[styles.shimmer, { transform: [{ translateX: shimmer }] }]} />
              </View>
            </>
          )}

          {stage === 'ready' && (
            <>
              <Text style={styles.body}>Downloaded. Android will ask you to confirm the install.</Text>
              <Pressable
                style={styles.primary}
                onPress={() => fileUri.current && installUpdate(fileUri.current)}
                accessibilityLabel="Install now"
              >
                <Text style={styles.primaryText}>Install</Text>
              </Pressable>
            </>
          )}

          {stage === 'failed' && (
            <>
              <Text style={styles.error}>{error}</Text>
              <Pressable style={styles.primary} onPress={start} accessibilityLabel="Try the download again">
                <Text style={styles.primaryText}>Try again</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => setRelease(null)} accessibilityLabel="Close">
                <Text style={styles.secondaryText}>Close</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', borderRadius: 22, backgroundColor: colors.surface, padding: 24, alignItems: 'center', gap: 10 },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 19, fontWeight: '700', marginTop: 4 },
  body: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  primary: { height: 48, alignSelf: 'stretch', borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
  secondary: { height: 40, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  track: { alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden', marginTop: 10 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  shimmer: { position: 'absolute', top: 0, bottom: 0, width: 90, backgroundColor: 'rgba(255,255,255,0.25)' },
}));
