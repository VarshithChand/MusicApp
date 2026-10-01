import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { usePlaylistMutations } from '../api/hooks';
import { Song } from '../api/types';
import { Icon } from '../components/Icon';
import { NameModal } from '../components/NameModal';
import { SongRow } from '../components/SongRow';
import { playQueue } from '../player/controls';
import { colors } from '../theme/theme';

export interface SongListParams {
  title: string;
  /** API path returning either Song[] or { songs: Song[] } (playlists). */
  path: string;
  kind?: 'playlist' | 'liked';
  /** Playlist id when kind === 'playlist'. */
  id?: number;
}

/** One screen for every list of songs: artist, album, playlist, liked songs. */
export function SongListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { title, path, kind, id } = useRoute<any>().params as SongListParams;
  const { rename, remove, removeSong } = usePlaylistMutations();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['songlist', path],
    queryFn: async () => {
      const res = await api<Song[] | { songs: Song[] }>(path);
      return Array.isArray(res) ? res : res.songs;
    },
  });

  const play = (index: number) => playQueue(data ?? [], index).then(() => navigation.navigate('NowPlaying'));

  const confirmDelete = () =>
    Alert.alert('Delete playlist?', `"${name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(id!, { onSuccess: () => navigation.goBack() }) },
    ]);

  const confirmRemoveSong = (song: Song) =>
    Alert.alert('Remove from playlist?', song.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeSong.mutate({ id: id!, songId: song.id }) },
    ]);

  return (
    <View style={[styles.flex, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.spacer} />
        {kind === 'playlist' && (
          <>
            <Pressable style={styles.iconBtn} onPress={() => setRenaming(true)} accessibilityLabel="Rename playlist">
              <Icon name="edit" size={22} color={colors.text} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={confirmDelete} accessibilityLabel="Delete playlist">
              <Icon name="trash" size={22} color={colors.danger} />
            </Pressable>
          </>
        )}
      </View>

      <FlatList
        data={data}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.top}>
            <Text style={styles.h1}>{name}</Text>
            <Text style={styles.sub}>{data ? `${data.length} songs` : ' '}</Text>
            <Pressable
              style={[styles.playAll, !data?.length && styles.disabled]}
              disabled={!data?.length}
              onPress={() => play(0)}
              accessibilityRole="button"
            >
              <Icon name="play" size={20} color={colors.onAccent} />
              <Text style={styles.playAllText}>Play all</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.sub}>{isError ? "Couldn't load songs." : 'Nothing here yet.'}</Text>
          )
        }
        renderItem={({ item, index }) => (
          <SongRow
            song={item}
            onPress={() => play(index)}
            onLongPress={kind === 'playlist' ? () => confirmRemoveSong(item) : undefined}
          />
        )}
      />

      <NameModal
        visible={renaming}
        title="Rename playlist"
        initial={name}
        confirmLabel="Save"
        onConfirm={(n) =>
          rename.mutate(
            { id: id!, name: n },
            {
              onSuccess: () => {
                setName(n);
                setRenaming(false);
              },
            },
          )
        }
        onClose={() => setRenaming(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  spacer: { flex: 1 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  top: { gap: 4, marginBottom: 16 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  sub: { color: colors.muted, fontSize: 14 },
  playAll: {
    marginTop: 12,
    alignSelf: 'flex-start',
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playAllText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
