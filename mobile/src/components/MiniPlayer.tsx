import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import TrackPlayer, {
  State,
  useActiveTrack,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';
import { colors } from '../theme/theme';
import { Cover } from './Cover';
import { Icon } from './Icon';
import { ProgressBar } from './ProgressBar';

export function MiniPlayer() {
  const navigation = useNavigation<any>();
  const track = useActiveTrack();
  const { state } = usePlaybackState();
  const { position, duration } = useProgress(500);

  if (!track) return null;
  const playing = state === State.Playing || state === State.Buffering || state === State.Loading;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable style={styles.info} onPress={() => navigation.navigate('NowPlaying')} accessibilityLabel="Open player">
          <Cover id={Number(track.id)} uri={track.artwork} size={44} radius={10} />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.play}
          onPress={() => (playing ? TrackPlayer.pause() : TrackPlayer.play())}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={20} color={colors.onAccent} />
        </Pressable>
      </View>
      <ProgressBar value={duration > 0 ? position / duration : 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginBottom: 8, padding: 8, paddingBottom: 0, borderRadius: 16, backgroundColor: colors.surface2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  artist: { color: colors.muted, fontSize: 12 },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
