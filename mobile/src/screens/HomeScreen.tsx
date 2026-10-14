import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import { LoadingBars } from '../components/LoadingBars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { useArtists, useLikedSongs, useRecentlyPlayed, useSongs, useTrending, useYouTube, useYouTubeFavorites } from '../api/hooks';
import { videoErrorText } from '../api/http';
import { GENRES } from '../data/genres';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { SongRow } from '../components/SongRow';
import { YouTubeResponse, YouTubeResult } from '../api/types';
import { playQueue } from '../player/controls';
import { useAuth } from '../store/auth';
import { useYouTubePlayer } from '../store/youtubePlayer';
import { colors, themedStyles } from '../theme/theme';

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
  const trending = useTrending('trending');
  const hits = useTrending('popular');
  const [genre, setGenre] = useState<string | null>(null);
  const genreLabel = GENRES.find((g) => g.key === genre)?.label ?? '';
  const genreVideos = useYouTube(genre ? `${genreLabel.toLowerCase()} songs telugu hindi english` : '', 'viewCount');
  const playVideo = useYouTubePlayer((s) => s.play);
  // Why a list stood in for another is upkeep, not something to explain to everyone.
  const isAdmin = !!useAuth((s) => s.user)?.is_admin;
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Asks the server for fresh Telugu results (it skips its cache) and stores them where the rows read from.
  const refreshVideos = (kind: 'trending' | 'popular') =>
    api<YouTubeResponse>(`/discover/trending?kind=${kind}&lang=te&fresh=1`)
      .then((data) => queryClient.setQueryData(['trending', kind, 'te'], data))
      .catch(() => {});

  const refresh = async () => {
    setRefreshing(true);
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

  const videoRow = (title: string, q: typeof trending) =>
    !!q.data?.results.length && (
      <View style={styles.section}>
        <Text style={styles.h2}>{title}</Text>
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {[{ key: null, label: 'All' }, ...GENRES].map((g) => {
          const on = genre === g.key;
          return (
            <Pressable
              key={g.key ?? 'all'}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setGenre(g.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{g.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {genre ? (
        <>
          {genreVideos.isFetching && <LoadingBars />}
          {genreVideos.isError && <Text style={styles.error}>{videoErrorText(genreVideos.error)}</Text>}
          {genreVideos.data && !genreVideos.data.configured && <Text style={styles.error}>Video search isn't set up on the server yet.</Text>}
          {genreVideos.data?.configured && !genreVideos.data.results.length && (
            <Text style={styles.muted}>No {genreLabel.toLowerCase()} songs found right now.</Text>
          )}
          {videoRow(`${genreLabel} songs`, genreVideos)}
        </>
      ) : (
        <>
          {videoRow('Trending Telugu videos', trending)}
          {videoRow('Popular Telugu videos', hits)}
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

      {!!popular.data?.length && (
        <View style={styles.section}>
          <Text style={styles.h2}>Popular</Text>
          {popular.data.slice(0, 10).map((s, i) => (
            <SongRow key={s.id} song={s} onPress={() => play(popular.data, i)} />
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
