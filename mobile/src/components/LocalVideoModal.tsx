import React, { useEffect, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { colors, themedStyles } from '../theme/theme';
import { Icon } from './Icon';
import { useVideoGestures } from './useVideoGestures';

interface Props {
  uri: string | null;
  title: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds || 0);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Plays a video already on the phone. Nothing leaves the device. */
export function LocalVideoModal({ uri, title, onClose, onPrev, onNext }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoRef = useRef<React.ComponentRef<typeof Video>>(null);
  const position = useRef(0);
  const durationRef = useRef(0);
  const barWidth = useRef(1);

  const landBox =
    height > width
      ? { width: height, height: width, left: (width - height) / 2, top: (height - width) / 2, transform: [{ rotate: '90deg' }] }
      : { width, height, left: 0, top: 0 };

  useEffect(() => {
    setPaused(false);
    setError(false);
    setCurrent(0);
    setDuration(0);
    durationRef.current = 0;
  }, [uri]);

  const seekTo = (t: number) => {
    const clamped = Math.min(durationRef.current || t, Math.max(0, t));
    position.current = clamped;
    setCurrent(clamped);
    videoRef.current?.seek(clamped);
  };

  // Tap or drag on the timeline to jump to that point in the video.
  const seekToX = (x: number) => {
    const total = durationRef.current;
    if (!total) return;
    seekTo((x / barWidth.current) * total);
  };
  const scrub = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => seekToX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => seekToX(e.nativeEvent.locationX),
    }),
  ).current;

  const gestures = useVideoGestures({
    rotated: landscape && height > width,
    onSeek: (delta) => seekTo(position.current + delta),
    onTogglePlay: () => setPaused((p) => !p),
    onVolume: setVolume,
  });
  const hud = gestures.hud;

  const timeline = (
    <View style={styles.timeline}>
      <Text style={styles.time}>{formatTime(current)}</Text>
      <View style={styles.trackWrap} onLayout={(e) => (barWidth.current = e.nativeEvent.layout.width)} {...scrub.panHandlers}>
        <View style={styles.trackBg}>
          <View style={[styles.trackFill, { width: `${duration ? Math.min(100, (current / duration) * 100) : 0}%` }]} />
        </View>
      </View>
      <Text style={styles.time}>{formatTime(duration)}</Text>
    </View>
  );

  const transport = (
    <View style={styles.transport}>
      <Pressable style={[styles.transportBtn, !onPrev && styles.disabled]} onPress={onPrev} disabled={!onPrev} accessibilityLabel="Previous video">
        <Icon name="prev" size={26} color={colors.text} />
      </Pressable>
      <Pressable style={[styles.transportBtn, styles.transportMain]} onPress={() => setPaused((p) => !p)} accessibilityLabel={paused ? 'Play' : 'Pause'}>
        <Icon name={paused ? 'play' : 'pause'} size={28} color={colors.onAccent} />
      </Pressable>
      <Pressable style={[styles.transportBtn, !onNext && styles.disabled]} onPress={onNext} disabled={!onNext} accessibilityLabel="Next video">
        <Icon name="next" size={26} color={colors.text} />
      </Pressable>
      <Pressable style={styles.transportBtn} onPress={() => setLandscape((l) => !l)} accessibilityLabel={landscape ? 'Rotate to portrait' : 'Rotate to landscape'}>
        <Icon name="expand" size={22} color={colors.text} />
      </Pressable>
    </View>
  );

  return (
    <Modal visible={!!uri} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.flex, landscape ? null : { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {!landscape && (
          <View style={styles.header}>
            <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close player">
              <Icon name="chevronDown" size={26} color={colors.text} />
            </Pressable>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </View>
        )}

        {uri && !error && (
          <View
            style={landscape ? [styles.landBox, landBox] : styles.playerWrap}
          >
            <Video
              ref={videoRef}
              source={{ uri }}
              style={styles.video}
              paused={paused}
              volume={volume}
              resizeMode="contain"
              onLoad={(d) => {
                durationRef.current = d.duration;
                setDuration(d.duration);
              }}
              onProgress={(d) => {
                position.current = d.currentTime;
                setCurrent(d.currentTime);
              }}
              onError={() => setError(true)}
            />
            <View style={StyleSheet.absoluteFill} onLayout={gestures.onLayout} {...gestures.panHandlers} />
            {hud && (
              <View style={styles.hudWrap} pointerEvents="none">
                <View style={styles.hud}>
                  <Text style={styles.hudText}>{hud}</Text>
                </View>
              </View>
            )}
            {paused && (
              <View style={styles.pausedBadge} pointerEvents="none">
                <Icon name="play" size={34} color="#fff" />
              </View>
            )}
            {landscape && (
              <Pressable style={styles.landExit} onPress={() => setLandscape(false)} accessibilityLabel="Exit full screen" hitSlop={8}>
                <Icon name="close" size={20} color="#fff" />
              </Pressable>
            )}
          </View>
        )}

        {uri && !error && !landscape && (
          <>
            {timeline}
            {transport}
          </>
        )}

        {uri && !error && landscape && (
          <View style={[styles.landControls, { paddingBottom: insets.bottom }]}>
            {timeline}
            {transport}
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>This video couldn't be played. It may use a format this phone doesn't support, or the file may have moved.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  playerWrap: { flex: 1 },
  landBox: { position: 'absolute', backgroundColor: '#000' },
  landControls: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  landExit: { position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  video: { flex: 1, backgroundColor: '#000' },
  hudWrap: { position: 'absolute', left: 0, right: 0, top: '40%', alignItems: 'center', zIndex: 10, elevation: 10 },
  hud: { backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 16 },
  hudText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  pausedBadge: { position: 'absolute', top: '50%', left: '50%', marginTop: -32, marginLeft: -32, width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  timeline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  time: { color: colors.muted, fontSize: 12, width: 44, textAlign: 'center' },
  trackWrap: { flex: 1, height: 28, justifyContent: 'center' },
  trackBg: { height: 4, borderRadius: 2, backgroundColor: colors.surface2 },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 14 },
  transportBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  transportMain: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { opacity: 0.35 },
  errorBox: { padding: 24 },
  errorText: { color: colors.danger, fontSize: 15 },
}));
