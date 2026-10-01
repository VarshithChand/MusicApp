import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSearch } from '../api/hooks';
import { Chip } from '../components/Chip';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { SongRow } from '../components/SongRow';
import { playQueue } from '../player/controls';
import { colors } from '../theme/theme';

type Kind = 'songs' | 'artists' | 'albums' | 'genres';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'songs', label: 'Songs' },
  { key: 'artists', label: 'Artists' },
  { key: 'albums', label: 'Albums' },
  { key: 'genres', label: 'Genres' },
];

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('songs');
  const { data, isFetching, isError } = useSearch(q);

  // Wait for a pause in typing before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const empty = !!q && !isFetching && data && !data[kind].length;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.h1}>Search</Text>

      <View>
        <View style={styles.searchIcon} pointerEvents="none">
          <Icon name="search" size={20} color={colors.muted} />
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Songs, artists, albums"
          placeholderTextColor="#7C8391"
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search songs, artists, albums or genres"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {KINDS.map((k) => (
          <Chip key={k.key} label={k.label} active={kind === k.key} onPress={() => setKind(k.key)} />
        ))}
      </ScrollView>

      {isFetching && <ActivityIndicator color={colors.accent} />}
      {isError && <Text style={styles.muted}>Search failed. Check your connection.</Text>}
      {!q && <Text style={styles.muted}>Find songs, artists, albums and genres.</Text>}
      {empty && <Text style={styles.muted}>No {kind} found for "{q}".</Text>}

      {data && kind === 'songs' &&
        data.songs.map((s, i) => (
          <SongRow
            key={s.id}
            song={s}
            subtitle={[s.artist_name, s.album_title].filter(Boolean).join(' · ')}
            onPress={() => playQueue(data.songs, i).then(() => navigation.navigate('NowPlaying'))}
          />
        ))}

      {data && kind === 'artists' &&
        data.artists.map((a) => (
          <Pressable
            key={a.id}
            style={styles.row}
            onPress={() => navigation.navigate('SongList', { title: a.name, path: `/artists/${a.id}/songs` })}
          >
            <Cover id={a.id} uri={a.image_url} size={52} radius={26} />
            <Text style={styles.rowTitle}>{a.name}</Text>
          </Pressable>
        ))}

      {data && kind === 'albums' &&
        data.albums.map((al) => (
          <Pressable
            key={al.id}
            style={styles.row}
            onPress={() => navigation.navigate('SongList', { title: al.title, path: `/albums/${al.id}/songs` })}
          >
            <Cover id={al.id} uri={al.cover_url} size={52} radius={12} />
            <View>
              <Text style={styles.rowTitle}>{al.title}</Text>
              <Text style={styles.rowSub}>{al.artist_name}</Text>
            </View>
          </Pressable>
        ))}

      {data && kind === 'genres' &&
        data.genres.map((g) => (
          <Pressable key={g.id} style={styles.row} onPress={() => {
              setText(g.name);
              setKind('songs');
            }}>
            <Text style={styles.rowTitle}>{g.name}</Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  h1: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  searchIcon: { position: 'absolute', left: 16, top: 16, zIndex: 1 },
  input: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 46,
    paddingRight: 16,
    color: colors.text,
    fontSize: 16,
  },
  chips: { gap: 8 },
  muted: { color: colors.muted, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
