import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlbums, useArtists, useLikedSongs, usePlaylistMutations, usePlaylists } from '../api/hooks';
import { Chip } from '../components/Chip';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { NameModal } from '../components/NameModal';
import { colors } from '../theme/theme';

type Tab = 'playlists' | 'albums' | 'artists';

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('playlists');
  const [creating, setCreating] = useState(false);
  const playlists = usePlaylists();
  const liked = useLikedSongs();
  const albums = useAlbums();
  const artists = useArtists();
  const { create } = usePlaylistMutations();

  const open = (title: string, path: string, extra: object = {}) =>
    navigation.navigate('SongList', { title, path, ...extra });

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Your library</Text>
        <Pressable style={styles.add} onPress={() => setCreating(true)} accessibilityLabel="New playlist">
          <Icon name="plus" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.chips}>
        <Chip label="Playlists" active={tab === 'playlists'} onPress={() => setTab('playlists')} />
        <Chip label="Albums" active={tab === 'albums'} onPress={() => setTab('albums')} />
        <Chip label="Artists" active={tab === 'artists'} onPress={() => setTab('artists')} />
      </View>

      {tab === 'playlists' && (
        <View style={styles.list}>
          <Pressable style={styles.row} onPress={() => open('Liked songs', '/users/me/liked-songs', { kind: 'liked' })}>
            <View style={[styles.art, { backgroundColor: colors.accent }]}>
              <Icon name="heart" size={26} color={colors.onAccent} filled />
            </View>
            <View style={styles.text}>
              <Text style={styles.title}>Liked songs</Text>
              <Text style={styles.sub}>{liked.data ? `${liked.data.length} songs` : 'Playlist'}</Text>
            </View>
          </Pressable>
          {playlists.isLoading && <ActivityIndicator color={colors.accent} />}
          {playlists.data?.map((p) => (
            <Pressable
              key={p.id}
              style={styles.row}
              onPress={() => open(p.name, `/playlists/${p.id}`, { kind: 'playlist', id: p.id })}
            >
              <Cover id={p.id} size={60} radius={14} />
              <View style={styles.text}>
                <Text style={styles.title}>{p.name}</Text>
                <Text style={styles.sub}>{p.song_count} songs</Text>
              </View>
            </Pressable>
          ))}
          {playlists.isSuccess && !playlists.data.length && (
            <Text style={styles.sub}>No playlists yet. Tap + to create one.</Text>
          )}
        </View>
      )}

      {tab === 'albums' && (
        <View style={styles.list}>
          {albums.isLoading && <ActivityIndicator color={colors.accent} />}
          {albums.data?.map((a) => (
            <Pressable key={a.id} style={styles.row} onPress={() => open(a.title, `/albums/${a.id}/songs`)}>
              <Cover id={a.id} uri={a.cover_url} size={60} radius={14} />
              <View style={styles.text}>
                <Text style={styles.title}>{a.title}</Text>
                <Text style={styles.sub}>{a.artist_name}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {tab === 'artists' && (
        <View style={styles.list}>
          {artists.isLoading && <ActivityIndicator color={colors.accent} />}
          {artists.data?.map((a) => (
            <Pressable key={a.id} style={styles.row} onPress={() => open(a.name, `/artists/${a.id}/songs`)}>
              <Cover id={a.id} uri={a.image_url} size={60} radius={30} />
              <View style={styles.text}>
                <Text style={styles.title}>{a.name}</Text>
                <Text style={styles.sub}>Artist</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <NameModal
        visible={creating}
        title="New playlist"
        confirmLabel="Create"
        onConfirm={(name) => create.mutate(name, { onSuccess: () => setCreating(false) })}
        onClose={() => setCreating(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  add: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8 },
  list: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68 },
  art: { width: 60, height: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
