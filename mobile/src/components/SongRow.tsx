import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Song } from '../api/types';
import { useSheet } from '../store/sheet';
import { colors } from '../theme/theme';
import { Cover } from './Cover';
import { Icon } from './Icon';

interface Props {
  song: Song;
  onPress: () => void;
  onLongPress?: () => void;
  /** Second line; defaults to the artist. */
  subtitle?: string;
}

export function SongRow({ song, onPress, onLongPress, subtitle }: Props) {
  const openSheet = useSheet((s) => s.open);
  return (
    <Pressable style={styles.row} onPress={onPress} onLongPress={onLongPress} accessibilityLabel={`Play ${song.title}`}>
      <Cover id={song.id} uri={song.cover_url} size={52} radius={12} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle ?? song.artist_name}
        </Text>
      </View>
      <Pressable style={styles.action} onPress={() => openSheet(song.id)} accessibilityLabel="Add to playlist" hitSlop={4}>
        <Icon name="plus" size={22} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
