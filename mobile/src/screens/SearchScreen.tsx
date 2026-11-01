import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import TrackPlayer from 'react-native-track-player';
import { Image, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import { LoadingBars } from '../components/LoadingBars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDiscover, useImportSong, useMovies, useSearch, useYouTube } from '../api/hooks';
import { Chip } from '../components/Chip';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { LabelBrowser } from '../components/LabelBrowser';
import { SongRow } from '../components/SongRow';
import { useSearchHistory } from '../store/searchHistory';
import { useYouTubePlayer } from '../store/youtubePlayer';
import { playQueue } from '../player/controls';
import { colors, themedStyles } from '../theme/theme';

type Kind = 'songs' | 'artists' | 'albums' | 'genres' | 'movies';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'songs', label: 'Songs' },
  { key: 'movies', label: 'Movies' },
  { key: 'artists', label: 'Artists' },
  { key: 'albums', label: 'Albums' },
  { key: 'genres', label: 'Genres' },
];

const TRENDING_SEARCHES = [
  'Choosi Chudangane',
  'Anirudh',
  'Devara',
  'Pushpa 2',
  'Thaman',
  'DSP',
  'Mass Hits',
  'Romantic',
];

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const routeLabel = useRoute<any>().params?.label as string | undefined;

  const { history, add: addHistory, remove: removeHistory, clear: clearHistory } = useSearchHistory();

  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('songs');

  const { data, isFetching, isError } = useSearch(q);
  const movies = useMovies(kind === 'movies' ? q : '');
  const discover = useDiscover(q);
  const youtube = useYouTube(q);
  const playYouTube = useYouTubePlayer((s) => s.play);
  const importSong = useImportSong();
  const [importingId, setImportingId] = useState<string | null>(null);

  // Execute a direct search from history or trending chips
  const executeSearch = (searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    setText(trimmed);
    setQ(trimmed);
    addHistory(trimmed);
  };

  // Clear query and return to Search History landing page
  const clearSearch = () => {
    setText('');
    setQ('');
  };

  // Adds the catalogue song to our library, then plays it
  const playFromWeb = async (externalId: string) => {
    setImportingId(externalId);
    try {
      const song = await importSong.mutateAsync(externalId);
      await playQueue([song], 0);
      navigation.navigate('NowPlaying');
    } catch {
      // stay on the search screen on error
    } finally {
      setImportingId(null);
    }
  };

  // Wait for a pause in typing before hitting the API & adding to history
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = text.trim();
      setQ(trimmed);
      if (trimmed.length >= 2) {
        addHistory(trimmed);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [text, addHistory]);

  const isSearchActive = !!q && q.trim().length > 0;
  const empty = kind !== 'movies' && isSearchActive && !isFetching && data && !data[kind].length;
  const moviesEmpty = kind === 'movies' && isSearchActive && !movies.isFetching && !!movies.data && !movies.data.length;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        {isSearchActive ? (
          <Pressable style={styles.backBtn} onPress={clearSearch} accessibilityLabel="Back to search history">
            <Icon name="back" size={24} color={colors.text} />
          </Pressable>
        ) : (
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <Icon name="back" size={24} color={colors.text} />
          </Pressable>
        )}
        <Text style={styles.h1} numberOfLines={1}>
          {isSearchActive ? `Results for "${q}"` : 'Search'}
        </Text>
      </View>

      {/* Persistent Search Box */}
      <View style={styles.searchBoxWrap}>
        <View style={styles.searchIcon} pointerEvents="none">
          <Icon name="search" size={20} color={colors.muted} />
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Songs, artists, movies, albums"
          placeholderTextColor="#7C8391"
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search songs, artists, albums or genres"
        />
        {text.length > 0 && (
          <Pressable style={styles.clearBtn} onPress={clearSearch} accessibilityLabel="Clear search input">
            <Icon name="close" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* =========================================================================
          PAGE 1: SEARCH HISTORY & DISCOVERY LANDING VIEW (Shown by default when no search active)
          ========================================================================= */}
      {!isSearchActive && (
        <View style={styles.historyContainer}>
          {/* Recent Searches Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Searches</Text>
              {history.length > 0 && (
                <Pressable onPress={clearHistory} hitSlop={8} accessibilityLabel="Clear all search history">
                  <Text style={styles.clearAllText}>Clear all</Text>
                </Pressable>
              )}
            </View>

            {history.length > 0 ? (
              <View style={styles.historyList}>
                {history.map((item) => (
                  <View key={item} style={styles.historyRow}>
                    <Pressable
                      style={styles.historyMain}
                      onPress={() => executeSearch(item)}
                      accessibilityLabel={`Search ${item}`}
                    >
                      <Icon name="history" size={18} color={colors.muted} />
                      <Text style={styles.historyText} numberOfLines={1}>
                        {item}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => removeHistory(item)}
                      hitSlop={10}
                      accessibilityLabel={`Remove ${item} from history`}
                    >
                      <Icon name="close" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyHistoryBox}>
                <Icon name="history" size={28} color={colors.muted} />
                <Text style={styles.emptyHistoryTitle}>No recent searches</Text>
                <Text style={styles.emptyHistorySub}>Your search queries will appear here.</Text>
              </View>
            )}
          </View>

          {/* Trending Searches Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trending & Popular</Text>
            <View style={styles.trendingWrap}>
              {TRENDING_SEARCHES.map((item) => (
                <Pressable
                  key={item}
                  style={styles.trendingChip}
                  onPress={() => executeSearch(item)}
                  accessibilityLabel={`Search ${item}`}
                >
                  <Icon name="search" size={13} color={colors.muted} />
                  <Text style={styles.trendingText}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Label Browser / Categories */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Browse Catalogue</Text>
            <LabelBrowser key={routeLabel} initialLabel={routeLabel} />
          </View>
        </View>
      )}

      {/* =========================================================================
          PAGE 2: SEARCH RESULTS RESPONSE VIEW (Dedicated results page when query is active)
          ========================================================================= */}
      {isSearchActive && (
        <View style={styles.resultsContainer}>
          {/* Category Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {KINDS.map((k) => (
              <Chip key={k.key} label={k.label} active={kind === k.key} onPress={() => setKind(k.key)} />
            ))}
          </ScrollView>

          {kind !== 'movies' && isFetching && <LoadingBars />}
          {kind !== 'movies' && isError && <Text style={styles.muted}>Search failed. Check your connection.</Text>}
          {empty && <Text style={styles.muted}>No {kind} found for "{q}".</Text>}

          {/* Movies Results */}
          {kind === 'movies' && movies.isFetching && <LoadingBars />}
          {kind === 'movies' && movies.isError && <Text style={styles.muted}>Couldn't load movies. Check your connection.</Text>}
          {kind === 'movies' && moviesEmpty && <Text style={styles.muted}>No movies found for "{q}".</Text>}
          {kind === 'movies' && !!movies.data?.length && (
            <View style={styles.movieGrid}>
              {movies.data.map((m) => (
                <Pressable
                  key={m.id}
                  style={styles.movieCard}
                  onPress={() => navigation.navigate('MovieDetail', { id: m.id })}
                  accessibilityLabel={`Open ${m.title}`}
                >
                  <Cover id={m.id} uri={m.poster_url} size={148} radius={16} />
                  <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {[m.language, m.release_year].filter(Boolean).join(' · ') || m.artist_name}
                  </Text>
                  <Text style={styles.rowSub}>
                    {m.song_count} song{m.song_count === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Songs Results */}
          {data && kind === 'songs' &&
            data.songs.map((s, i) => (
              <SongRow
                key={s.id}
                song={s}
                subtitle={[s.artist_name, s.album_title].filter(Boolean).join(' · ')}
                onPress={() => playQueue(data.songs, i).then(() => navigation.navigate('NowPlaying'))}
              />
            ))}

          {/* Web Creative Commons Results */}
          {kind === 'songs' && !!q && discover.data?.configured && (
            <View style={styles.web}>
              <Text style={styles.webTitle}>From the web</Text>
              <Text style={styles.muted}>Free, Creative Commons music. Tap a song to listen — it's also saved to your library.</Text>
              {discover.isFetching && <LoadingBars />}
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
                          <LoadingBars />
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
                    <Pressable
                      style={styles.license}
                      onPress={() => Linking.openURL(t.licenseUrl!)}
                      accessibilityLabel="View Creative Commons license"
                    >
                      <Text style={styles.licenseText}>CC</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* YouTube Video Results */}
          {kind === 'songs' && !!q && youtube.data?.configured && (
            <View style={styles.web}>
              <Text style={styles.webTitle}>On YouTube</Text>
              <Text style={styles.muted}>Plays in YouTube's own player. Nothing is saved to your library.</Text>
              {youtube.isFetching && <LoadingBars />}
              {youtube.isError && <Text style={styles.muted}>YouTube search is unavailable right now.</Text>}
              {!youtube.isFetching && youtube.data.results.length === 0 && <Text style={styles.muted}>No videos found.</Text>}
              {youtube.data.results.map((v) => (
                <Pressable
                  key={v.videoId}
                  style={styles.row}
                  onPress={async () => {
                    await TrackPlayer.pause();
                    playYouTube(v.videoId, v.title, { channel: v.channel, thumbnail: v.thumbnail });
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

          {/* Artists Results */}
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

          {/* Albums Results */}
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

          {/* Genres Results */}
          {data && kind === 'genres' &&
            data.genres.map((g) => (
              <Pressable
                key={g.id}
                style={styles.row}
                onPress={() => {
                  setText(g.name);
                  setKind('songs');
                }}
              >
                <Text style={styles.rowTitle}>{g.name}</Text>
              </Pressable>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  searchBoxWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  clearBtn: { position: 'absolute', right: 14, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  input: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 46,
    paddingRight: 46,
    color: colors.text,
    fontSize: 16,
  },
  chips: { gap: 8 },
  muted: { color: colors.muted, fontSize: 15 },

  // Search History Landing Styles
  historyContainer: { gap: 24, marginTop: 4 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  clearAllText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  historyList: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  historyMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  historyText: { color: colors.text, fontSize: 15, fontWeight: '500', flex: 1 },
  removeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  emptyHistoryBox: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 28, alignItems: 'center', gap: 6 },
  emptyHistoryTitle: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 4 },
  emptyHistorySub: { color: colors.muted, fontSize: 13, textAlign: 'center' },

  // Trending Suggestions
  trendingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trendingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  trendingText: { color: colors.text, fontSize: 13, fontWeight: '500' },

  // Search Results Response Container
  resultsContainer: { gap: 16 },
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
  movieGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  movieCard: { width: 148, gap: 2 },
}));
