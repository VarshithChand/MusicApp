import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { LocalAudioFile, LocalVideoFile } from '../api/types';
import { useLocalFavorites } from '../store/localFavorites';
import { colors, themedStyles } from '../theme/theme';
import { Icon } from './Icon';

const formatDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

interface AudioProps {
  kind: 'audio';
  item: LocalAudioFile;
  onPress: () => void;
}
interface VideoProps {
  kind: 'video';
  item: LocalVideoFile;
  onPress: () => void;
}

/** One local audio or video file: artwork/thumbnail, title + details, and a favorite star (device-only). */
export function LocalMediaRow({ kind, item, onPress }: AudioProps | VideoProps) {
  const isFavorite = useLocalFavorites((s) => s.isFavorite(kind, item.uri));
  const toggle = useLocalFavorites((s) => s.toggle);
  const thumb = kind === 'audio' ? item.artworkUri : item.thumbnailUri;
  const subtitle =
    kind === 'audio'
      ? [item.artist, item.album].filter(Boolean).join(' · ') || formatDuration(item.durationMs)
      : [formatDuration(item.durationMs), formatSize(item.sizeBytes), item.width && item.height ? `${item.width}x${item.height}` : null]
          .filter(Boolean)
          .join(' · ');

  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityLabel={`Play ${item.title}`}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={[styles.art, kind === 'video' && styles.videoArt]} />
      ) : (
        <View style={[styles.art, kind === 'video' && styles.videoArt, styles.artPlaceholder]}>
          <Icon name={kind === 'audio' ? 'library' : 'video'} size={20} color={colors.muted} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Pressable style={styles.favBtn} onPress={() => toggle(kind, item.uri)} accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'} hitSlop={8}>
        <Icon name="heart" size={20} color={colors.accent} filled={isFavorite} />
      </Pressable>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  art: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.surface2 },
  videoArt: { width: 84, height: 52, borderRadius: 8 },
  artPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  favBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
}));
