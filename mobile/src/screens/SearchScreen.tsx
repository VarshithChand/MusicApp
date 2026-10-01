import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import TrackPlayer from 'react-native-track-player';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDiscover, useImportSong, useSearch, useYouTube } from '../api/hooks';
import { Chip } from '../components/Chip';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { SongRow } from '../components/SongRow';
import { YouTubeModal } from '../components/YouTubeModal';
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
  const discover = useDiscover(q);
  const youtube = useYouTube(q);
  const [video, setVideo] = useState<{ videoId: string; title: string } | null>(null);
  const importSong = useImportSong();
  const [importingId, setImportingId] = useState<string | null>(null);

  // Adds the catalogue song to our library, then plays it. The audio is copied into our storage in the background.
  const playFromWeb = async (externalId: string) => {
    setImportingId(externalId);
    try {
      const song = await importSong.mutateAsync(externalId);
      await playQueue([song], 0);
      navigation.navigate('NowPlaying');
    } catch {
      // the error line below explains it; stay on the search screen
    } finally {
      setImportingId(null);
    }
  };

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

      {kind === 'songs' && !!q && discover.data?.configured && (
        <View style={styles.web}>
          <Text style={styles.webTitle}>From the web</Text>
          <Text style={styles.muted}>Free, Creative Commons music. Tap a song to listen — it's also saved to your library.</Text>
          {discover.isFetching && <ActivityIndicator color={colors.accent} />}
          {discover.isError && <Text style={styles.muted}>The web catalogue is unavailable right now.</Text>}
          {!discover.isFetching && discover.data.results.length === 0 && <Text style={styles.muted}>No free songs found on the web.</Text>}
          {importSong.isError && <Text style={styles.muted}>Couldn't add that song. Try another.</Text>}
          {discover.data.results.map((t) => (
            <View key={t.externalId} style={styles.webRow}>
              <Pressable
                style={styles.webMain}
                onPress={() => playFromWeb(t.externalId)}
                disabled={importingId !== null}
                accessibilityLabel={`Play ${t.title}`}
              >
                <View>
                  <Cover id={Number(t.externalId)} uri={t.cover} size={52} radius={12} />
                  {importingId === t.externalId && (
                    <View style={styles.webLoading}>
                      <ActivityIndicator color={colors.accent} />
                    </View>
                  )}
                </View>
                <View style={styles.webText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[t.artist, t.album].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
              {t.licenseUrl && (
                <Pressable style={styles.license} onPress={() => Linking.openURL(t.licenseUrl!)} accessibilityLabel="Creative Commons licence">
                  <Text style={styles.licenseText}>CC</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {kind === 'songs' && !!q && youtube.data?.configured && (
        <View style={styles.web}>
          <Text style={styles.webTitle}>On YouTube</Text>
          <Text style={styles.muted}>Plays in YouTube's own player. Nothing is saved to your library.</Text>
          {youtube.isFetching && <ActivityIndicator color={colors.accent} />}
          {youtube.isError && <Text style={styles.muted}>YouTube search is unavailable right now.</Text>}
          {!youtube.isFetching && youtube.data.results.length === 0 && <Text style={styles.muted}>No videos found.</Text>}
          {youtube.data.results.map((v) => (
            <Pressable
              key={v.videoId}
              style={styles.webRow}
              onPress={() => {
                TrackPlayer.pause().catch(() => {});
                setVideo({ videoId: v.videoId, title: v.title });
              }}
              accessibilityLabel={`Play ${v.title} on YouTube`}
            >
              {v.thumbnail ? <Image source={{ uri: v.thumbnail }} style={styles.ytThumb} /> : <View style={styles.ytThumb} />}
              <View style={styles.webText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {v.title}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {v.channel}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <YouTubeModal videoId={video?.videoId ?? null} title={video?.title ?? ''} onClose={() => setVideo(null)} />

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
  web: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.surface2, gap: 8 },
  webTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  webRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60 },
  webMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  webText: { flex: 1, minWidth: 0 },
  webLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, backgroundColor: 'rgba(14,16,20,0.62)', alignItems: 'center', justifyContent: 'center' },
  license: { minWidth: 44, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  ytThumb: { width: 96, height: 54, borderRadius: 8, backgroundColor: colors.surface2 },
  licenseText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
});
