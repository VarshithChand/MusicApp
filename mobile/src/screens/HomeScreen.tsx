import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import { LoadingBars } from '../components/LoadingBars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import {
  useArtists,
  useLikedSongs,
  usePreferredLanguages,
  useRecentlyPlayed,
  useSongs,
  useTrending,
  useYouTube,
  useYouTubeFavorites,
} from '../api/hooks';
import { videoErrorText } from '../api/http';
import { GENRES } from '../data/genres';
import { LANGUAGES, languageLabel } from '../data/languages';
import { Cover } from '../components/Cover';
import { Dropdown } from '../components/Dropdown';
import { Icon } from '../components/Icon';
import { SongRow } from '../components/SongRow';
import { Song, YouTubeResponse, YouTubeResult } from '../api/types';
import { playQueue } from '../player/controls';
import { useAuth } from '../store/auth';
import { useSelection } from '../store/selection';
import { useYouTubePlayer } from '../store/youtubePlayer';
import { colors, themedStyles } from '../theme/theme';

/** How many of the newest songs are held at the front, so a new arrival is never shuffled out of sight. */
const NEWEST_KEPT_FIRST = 3;

/** Deterministic for a given pass, so a re-render doesn't reorder the list under the listener's finger. */
function shuffled<T>(items: T[], pass: number): T[] {
  const out = [...items];
  let state = (pass * 7919 + 1) % 2147483647;
  const next = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Newly added songs first, everything else in a fresh order on every refresh, so Home is not the
 * same list each time and anything just added is seen rather than buried. Ids rise as songs are
 * added, so the highest ones are the newest.
 */
function forHome(songs: Song[] | undefined, pass: number): Song[] {
  if (!songs?.length) return [];
  const newest = [...songs].sort((a, b) => b.id - a.id).slice(0, NEWEST_KEPT_FIRST);
  const held = new Set(newest.map((s) => s.id));
  return [...newest, ...shuffled(songs.filter((s) => !held.has(s.id)), pass)];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const recent = useRecentlyPlayed();
  const popular = useSongs('popular');
  const artists = useArtists();
  const liked = useLikedSongs();
  const ytFavorites = useYouTubeFavorites();
  const genre = useSelection((s) => s.genre);
  const setGenre = useSelection((s) => s.setGenre);
  const chosenLanguage = useSelection((s) => s.language);
  const setLanguage = useSelection((s) => s.setLanguage);
  const { primary: accountLanguage } = usePreferredLanguages();
  const primary = chosenLanguage ?? accountLanguage;
  const langName = languageLabel(primary);
  const trending = useTrending('trending', primary);
  const hits = useTrending('popular', primary);
  const genreLabel = GENRES.find((g) => g.key === genre)?.label ?? '';
  const genreVideos = useYouTube(genre ? `${genreLabel.toLowerCase()} songs` : '', 'viewCount', primary);
  const playVideo = useYouTubePlayer((s) => s.play);
  // Why a list stood in for another is upkeep, not something to explain to everyone.
  const isAdmin = !!useAuth((s) => s.user)?.is_admin;
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  // Bumped on every pull-to-refresh, which is what re-orders the list below.
  const [pass, setPass] = useState(0);
  const popularShown = useMemo(() => forHome(popular.data, pass), [popular.data, pass]);

  // Asks the server for fresh Telugu results (it skips its cache) and stores them where the rows read from.
  const refreshVideos = (kind: 'trending' | 'popular') =>
    api<YouTubeResponse>(`/discover/trending?kind=${kind}&lang=${primary}&fresh=1`)
      .then((data) => queryClient.setQueryData(['trending', kind, primary], data))
      .catch(() => {});

  const refresh = async () => {
    setRefreshing(true);
    setPass((n) => n + 1);
    try {
      await Promise.all([
        recent.refetch(),
        popular.refetch(),
        artists.refetch(),
        liked.refetch(),
        ytFavorites.refetch(),
        refreshVideos('trending'),
        refreshVideos('popular'),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const videoRow = (title: string, q: typeof trending, standInTitle: string) =>
    !!q.data?.results.length && (
      <View style={styles.section}>
        {/* A stand-in list is not in the chosen language, so it must not keep that language's heading. */}
        <Text style={styles.h2}>{q.data?.note ? standInTitle : title}</Text>
        {!!q.data?.note && isAdmin && <Text style={styles.muted}>{q.data.note}</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
          {q.data.results.map((v: YouTubeResult) => (
            <Pressable key={v.videoId} style={styles.vcard} onPress={() => playVideo(v.videoId, v.title)} accessibilityLabel={`Play ${v.title}`}>
              {v.thumbnail ? <Image source={{ uri: v.thumbnail }} style={styles.thumb} /> : <View style={styles.thumb} />}
              <Text style={styles.cardTitle} numberOfLines={2}>{v.title}</Text>
              <Text style={styles.vchannel} numberOfLines={1}>{v.channel}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );

  const play = (songs: typeof popular.data, index: number) => {
    if (!songs) return;
    playQueue(songs, index).then(() => navigation.navigate('NowPlaying'));
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <View style={styles.header}>
        <Text style={styles.h1}>{greeting()}</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.avatar} onPress={() => navigation.navigate('Search')} accessibilityLabel="Search">
            <Icon name="search" size={22} color={colors.text} />
          </Pressable>
          <Pressable style={styles.avatar} onPress={() => navigation.navigate('Account')} accessibilityLabel="Account">
            <Icon name="user" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {popular.isLoading && <LoadingBars />}
      {popular.isError && <Text style={styles.error}>Couldn't load music. Check your connection.</Text>}

      <View style={styles.pickers}>
        <Dropdown
          label="Language"
          value={primary}
          options={LANGUAGES.map((l) => ({ key: l.key, label: l.label }))}
          onChange={setLanguage}
        />
        <Dropdown
          label="Genre"
          value={genre}
          options={[{ key: null, label: 'All genres' }, ...GENRES.map((g) => ({ key: g.key, label: g.label }))]}
          onChange={setGenre}
        />
      </View>

      {genre ? (
        <>
          {genreVideos.isFetching && <LoadingBars />}
          {genreVideos.isError && <Text style={styles.error}>{videoErrorText(genreVideos.error)}</Text>}
          {genreVideos.data && !genreVideos.data.configured && <Text style={styles.error}>Video search isn't set up on the server yet.</Text>}
          {genreVideos.data?.configured && !genreVideos.data.results.length && (
            <Text style={styles.muted}>No {genreLabel.toLowerCase()} songs found right now.</Text>
          )}
          {videoRow(`${genreLabel} songs`, genreVideos, `Popular ${genreLabel.toLowerCase()} videos`)}
        </>
      ) : (
        <>
          {videoRow(`Latest ${langName} videos`, trending, 'Latest music videos')}
          {videoRow(`Popular ${langName} videos`, hits, 'Popular music videos')}
        </>
      )}

      {ytFavorites.data && (
        <View style={styles.section}>
          <Text style={styles.h2}>Your favorite videos</Text>
          {ytFavorites.data.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
              {ytFavorites.data.map((v) => (
                <Pressable key={v.videoId} style={styles.vcard} onPress={() => playVideo(v.videoId, v.title)} accessibilityLabel={`Play ${v.title}`}>
                  {v.thumbnail ? <Image source={{ uri: v.thumbnail }} style={styles.thumb} /> : <View style={styles.thumb} />}
                  <Text style={styles.cardTitle} numberOfLines={2}>{v.title}</Text>
                  <Text style={styles.vchannel} numberOfLines={1}>{v.channel}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.muted}>No favorite videos yet.</Text>
          )}
        </View>
      )}

      {!!liked.data?.length && (
        <View style={styles.section}>
          <Text style={styles.h2}>Your favorite songs</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
            {liked.data.map((s, i) => (
              <Pressable key={s.id} style={styles.card} onPress={() => play(liked.data, i)}>
                <Cover id={s.id} uri={s.cover_url} size={108} radius={16} />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {s.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {!!popularShown.length && (
        <View style={styles.section}>
          <Text style={styles.h2}>Popular</Text>
          {popularShown.slice(0, 10).map((s, i) => (
            <SongRow key={s.id} song={s} onPress={() => play(popularShown, i)} />
          ))}
        </View>
      )}

      {!!artists.data?.length && (
        <View style={styles.section}>
          <Text style={styles.h2}>Artists</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
            {artists.data.map((a) => (
              <Pressable
                key={a.id}
                style={styles.artist}
                onPress={() =>
                  navigation.navigate('SongList', { title: a.name, path: `/artists/${a.id}/songs` })
                }
              >
                <Cover id={a.id} uri={a.image_url} size={76} radius={38} />
                <Text style={styles.artistName} numberOfLines={1}>
                  {a.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {!!recent.data?.length && (
        <View style={styles.section}>
          <Text style={styles.h2}>Recently played</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
            {recent.data.map((s, i) => (
              <Pressable key={s.id} style={styles.card} onPress={() => play(recent.data, i)}>
                <Cover id={s.id} uri={s.cover_url} size={108} radius={16} />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {s.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 6 },
  h2: { color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8 },
  hrow: { gap: 14 },
  chipRow: { gap: 8 },
  pickers: { flexDirection: 'row', gap: 10 },
  muted: { color: colors.muted, fontSize: 14 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: colors.onAccent },
  card: { width: 108, gap: 8 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  vcard: { width: 200, gap: 6 },
  thumb: { width: 200, height: 112, borderRadius: 12, backgroundColor: colors.surface2 },
  vchannel: { color: colors.muted, fontSize: 12 },
  artist: { width: 76, alignItems: 'center', gap: 8 },
  artistName: { color: colors.text, fontSize: 13, fontWeight: '500' },
  error: { color: colors.danger, fontSize: 14 },
}));
