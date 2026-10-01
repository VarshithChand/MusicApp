import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, {
  RepeatMode,
  State,
  useActiveTrack,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';
import { useLikedSongs, useToggleLike } from '../api/hooks';
import { Cover } from '../components/Cover';
import { Icon, IconName } from '../components/Icon';
import { ProgressBar } from '../components/ProgressBar';
import { shuffleUpNext } from '../player/controls';
import { colors } from '../theme/theme';

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const track = useActiveTrack();
  const { state } = usePlaybackState();
  const { position, duration } = useProgress(500);
  const liked = useLikedSongs();
  const toggleLike = useToggleLike();
  const [repeat, setRepeat] = useState(false);
  const [volume, setVolume] = useState(1);

  const playing = state === State.Playing || state === State.Buffering || state === State.Loading;
  const songId = track ? Number(track.id) : null;
  const isLiked = !!liked.data?.some((s) => s.id === songId);

  const toggleRepeat = () => {
    TrackPlayer.setRepeatMode(repeat ? RepeatMode.Off : RepeatMode.Queue);
    setRepeat(!repeat);
  };
  const changeVolume = (v: number) => {
    const clamped = Math.min(Math.max(v, 0), 1);
    TrackPlayer.setVolume(clamped);
    setVolume(clamped);
  };

  const Control = ({ icon, label, size = 30, onPress, color = colors.text }: {
    icon: IconName; label: string; size?: number; onPress: () => void; color?: string;
  }) => (
    <Pressable style={styles.control} onPress={onPress} accessibilityLabel={label}>
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );

  return (
    <View style={[styles.flex, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Pressable style={styles.control} onPress={() => navigation.goBack()} accessibilityLabel="Close player">
          <Icon name="chevronDown" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>NOW PLAYING</Text>
          <Text style={styles.album} numberOfLines={1}>
            {track?.album ?? ' '}
          </Text>
        </View>
        <View style={styles.control} />
      </View>

      <View style={styles.art}>
        <Cover id={songId ?? 0} uri={track?.artwork} size={320} radius={24} />
      </View>

      <View style={styles.titleRow}>
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {track?.title ?? 'Nothing playing'}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track?.artist ?? ' '}
          </Text>
        </View>
        {songId != null && (
          <Pressable
            style={styles.control}
            onPress={() => toggleLike.mutate({ songId, liked: isLiked })}
            accessibilityLabel={isLiked ? 'Unlike song' : 'Like song'}
            accessibilityState={{ selected: isLiked }}
          >
            <Icon name="heart" size={28} color={isLiked ? colors.accent : colors.muted} filled={isLiked} />
          </Pressable>
        )}
      </View>

      <View style={styles.progress}>
        <ProgressBar
          value={duration > 0 ? position / duration : 0}
          thumb
          onSeek={(f) => duration > 0 && TrackPlayer.seekTo(f * duration)}
        />
        <View style={styles.times}>
          <Text style={styles.time}>{fmt(position)}</Text>
          <Text style={styles.time}>{fmt(duration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Control icon="shuffle" label="Shuffle up next" size={24} color={colors.muted} onPress={shuffleUpNext} />
        <Control icon="prev" label="Previous song" onPress={() => TrackPlayer.skipToPrevious().catch(() => TrackPlayer.seekTo(0))} />
        <Pressable
          style={styles.play}
          onPress={() => (playing ? TrackPlayer.pause() : TrackPlayer.play())}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={32} color={colors.onAccent} />
        </Pressable>
        <Control icon="next" label="Next song" onPress={() => TrackPlayer.skipToNext().catch(() => {})} />
        <Control icon="repeat" label="Repeat" size={24} color={repeat ? colors.accent : colors.muted} onPress={toggleRepeat} />
      </View>

      <View style={styles.volume}>
        <Icon name="volume" size={20} color={colors.muted} />
        <View style={styles.flex}>
          <ProgressBar value={volume} color={colors.muted} onSeek={changeVolume} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { alignItems: 'center', flex: 1 },
  kicker: { color: colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  album: { color: colors.text, fontSize: 14, fontWeight: '600' },
  art: { alignItems: 'center', marginTop: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28 },
  titles: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  artist: { color: colors.muted, fontSize: 16, marginTop: 2 },
  control: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  progress: { marginTop: 16 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: colors.muted, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  play: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  volume: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 'auto' },
});
