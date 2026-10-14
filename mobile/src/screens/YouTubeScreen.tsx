import Clipboard from '@react-native-clipboard/clipboard';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import { LoadingBars } from '../components/LoadingBars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  usePreferredLanguages,
  useToggleYouTubeFavorite,
  useTrending,
  useYouTube,
  useYouTubeFavorites,
  useYouTubeVideo,
} from '../api/hooks';
import { videoErrorText } from '../api/http';
import { YouTubeResult } from '../api/types';
import { Icon } from '../components/Icon';
import { GENRES } from '../data/genres';
import { languageLabel } from '../data/languages';
import { TASTES } from '../data/tastes';
import { useAuth } from '../store/auth';
import { useSelection } from '../store/selection';
import { useYouTubePlayer } from '../store/youtubePlayer';
import { colors, themedStyles } from '../theme/theme';

/** Accepts watch?v=, youtu.be/, and /shorts/ links, with or without extra query params. */
const VIDEO_ID_PATTERNS = [/[?&]v=([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /\/shorts\/([\w-]{11})/];

function parseVideoId(input: string): string | null {
  const text = input.trim();
  for (const pattern of VIDEO_ID_PATTERNS) {
    const m = pattern.exec(text);
    if (m) return m[1];
  }
  // A bare 11-character ID, pasted directly.
  return /^[\w-]{11}$/.test(text) ? text : null;
}

const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const MOODS = ['Mass', 'Class', 'Riding', 'Traveling', 'Alone', 'Sad', 'Romantic', 'Party'] as const;

export function YouTubeScreen() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null | undefined>(undefined);
  const user = useAuth((s) => s.user);
  // Why a list stood in for another is upkeep, not something to explain to everyone.
  const isAdmin = !!user?.is_admin;
  const firstTaste = user?.song_tastes?.[0];
  const firstGenre = user?.genres?.[0];
  const defaultMood = firstTaste
    ? (TASTES.find((t) => t.key === firstTaste)?.label ?? null)
    : firstGenre
      ? (GENRES.find((g) => g.key === firstGenre)?.label ?? null)
      : null;
  const activeMood = mood === undefined ? defaultMood : mood;
  const [filterOpen, setFilterOpen] = useState(false);
  const [panel, setPanel] = useState<'favorites' | 'recent' | null>(null);
  const [badLink, setBadLink] = useState(false);
  const play = useYouTubePlayer((s) => s.play);
  const playFromList = useYouTubePlayer((s) => s.playFromList);
  const recent = useYouTubePlayer((s) => s.recent);
  const video = useYouTubeVideo(lookupId);
  const query = searchTerm
    ? activeMood
      ? `${searchTerm} ${activeMood.toLowerCase()} songs`
      : searchTerm
    : activeMood
      ? `telugu ${activeMood.toLowerCase()} songs`
      : null;
  const resultsLabel = [activeMood, searchTerm].filter(Boolean).join(' · ');
  const { primary: accountLanguage } = usePreferredLanguages();
  // Whatever was picked on Home, so the two pages never disagree about the language.
  const chosenLanguage = useSelection((s) => s.language);
  const primary = chosenLanguage ?? accountLanguage;
  const langName = languageLabel(primary);
  const topHits = useYouTube(query ?? '', 'viewCount', primary);
  const latest = useYouTube(query ?? '', 'date', primary);
  const popularTe = useTrending('popular', primary);
  const latestTe = useYouTube(`${langName.toLowerCase()} songs`, 'date', primary);
  const favorites = useYouTubeFavorites();
  const { add, remove } = useToggleYouTubeFavorite();

  // Search as you type: a name waits briefly for a pause in typing; a link never triggers a name search.
  useEffect(() => {
    const value = text.trim();
    const timer = setTimeout(() => setSearchTerm(value.length >= 2 && !parseVideoId(value) ? value : null), 350);
    return () => clearTimeout(timer);
  }, [text]);

  const fetchDetails = () => {
    const id = parseVideoId(text);
    if (id) {
      setBadLink(false);
      setLookupId(id);
      return;
    }
    setLookupId(null);
    if (text.trim().length < 2) {
      setBadLink(true);
      setSearchTerm(null);
      return;
    }
    setBadLink(false);
    setSearchTerm(text.trim());
  };

  const autofillFromClipboard = async () => {
    if (text.trim()) return;
    const clip = (await Clipboard.getString()).trim();
    if (parseVideoId(clip)) setText(clip);
  };

  const isFavorite = (id: string) => !!favorites.data?.some((v) => v.videoId === id);
  const toggleFavorite = (id: string, title: string, channel: string | null, thumbnail: string | null) => {
    if (isFavorite(id)) remove.mutate(id);
    else add.mutate({ videoId: id, title, channel, thumbnail });
  };

  const result = video.data?.video;

  const videoRows = (
    list: YouTubeResult[] | undefined,
    status: { fetching: boolean; error: unknown; configured: boolean | undefined; note?: string },
  ) => (
    <>
      {status.fetching && <LoadingBars />}
      {!!status.error && <Text style={styles.error}>{videoErrorText(status.error)}</Text>}
      {!!status.note && isAdmin && <Text style={styles.muted}>{status.note}</Text>}
      {status.configured === false && <Text style={styles.error}>Video search isn't set up on the server yet.</Text>}
      {list?.length === 0 && <Text style={styles.muted}>Nothing found.</Text>}
      {list?.map((r, i) => (
        <Pressable
          key={r.videoId}
          style={styles.favRow}
          onPress={() => playFromList(list, i)}
          accessibilityLabel={`Play ${r.title}`}
        >
          <View style={styles.thumbWrap}>
            {r.thumbnail ? <Image source={{ uri: r.thumbnail }} style={styles.favThumb} /> : <View style={styles.favThumb} />}
            {formatDuration(r.durationSeconds) && (
              <View style={styles.durBadge}>
                <Text style={styles.durText}>{formatDuration(r.durationSeconds)}</Text>
              </View>
            )}
          </View>
          <View style={styles.flex1}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {r.title}
            </Text>
            <Text style={styles.muted} numberOfLines={1}>
              {r.channel}
            </Text>
          </View>
          <Pressable
            style={styles.favBtn}
            onPress={() => toggleFavorite(r.videoId, r.title, r.channel, r.thumbnail)}
            accessibilityLabel={isFavorite(r.videoId) ? 'Remove from favorites' : 'Add to favorites'}
            hitSlop={8}
          >
            <Icon name="heart" size={18} color={colors.accent} filled={isFavorite(r.videoId)} />
          </Pressable>
        </Pressable>
      ))}
    </>
  );

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.h1}>YouTube</Text>
      <Text style={styles.muted}>Search a song or movie, or paste a link, and save the ones you want to find again.</Text>

      <View>
        <View style={styles.searchWrap}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setBadLink(false);
            }}
            onFocus={autofillFromClipboard}
            placeholder="Paste a link or type a song or movie name"
            placeholderTextColor="#7C8391"
            style={[styles.input, styles.inputWithIcons]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={fetchDetails}
            accessibilityLabel="YouTube link"
          />
          {!!text && (
            <Pressable style={styles.clearX} onPress={() => setText('')} accessibilityLabel="Clear search" hitSlop={10}>
              <Icon name="close" size={18} color={colors.muted} />
            </Pressable>
          )}
          <Pressable style={styles.searchIcon} onPress={fetchDetails} accessibilityLabel="Search" hitSlop={10}>
            <Icon name="search" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            style={[styles.panelBtn, panel === 'favorites' && styles.panelBtnOn]}
            onPress={() => setPanel(panel === 'favorites' ? null : 'favorites')}
            accessibilityState={{ selected: panel === 'favorites' }}
          >
            <Text style={[styles.panelBtnText, panel === 'favorites' && styles.panelBtnTextOn]}>Favorites</Text>
          </Pressable>
          <Pressable
            style={[styles.panelBtn, panel === 'recent' && styles.panelBtnOn]}
            onPress={() => setPanel(panel === 'recent' ? null : 'recent')}
            accessibilityState={{ selected: panel === 'recent' }}
          >
            <Text style={[styles.panelBtnText, panel === 'recent' && styles.panelBtnTextOn]}>Recents</Text>
          </Pressable>
          <Pressable
            style={styles.panelBtn}
            onPress={() => setFilterOpen((o) => !o)}
            accessibilityLabel="Filter"
            accessibilityState={{ expanded: filterOpen }}
          >
            <Text style={styles.panelBtnText} numberOfLines={1}>
              {activeMood ? `Filter: ${activeMood}` : 'Filter'}
            </Text>
          </Pressable>
        </View>
      </View>

      {filterOpen && (
        <View style={styles.dropdown}>
          {['All moods', ...MOODS].map((label) => {
            const value = label === 'All moods' ? null : label;
            const on = activeMood === value;
            return (
              <Pressable
                key={label}
                style={styles.dropItem}
                onPress={() => {
                  setMood(on ? null : value);
                  setFilterOpen(false);
                }}
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.dropText, on && styles.dropTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {panel === 'favorites' && (
        <>
          {favorites.isLoading && <LoadingBars />}
          {favorites.isSuccess && favorites.data.length === 0 && <Text style={styles.muted}>Nothing saved yet.</Text>}
          {favorites.data?.map((v) => (
            <Pressable
              key={v.videoId}
              style={styles.favRow}
              onPress={() => play(v.videoId, v.title, { channel: v.channel, thumbnail: v.thumbnail })}
            >
              {v.thumbnail ? <Image source={{ uri: v.thumbnail }} style={styles.favThumb} /> : <View style={styles.favThumb} />}
              <View style={styles.flex1}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {v.title}
                </Text>
                {!!v.channel && (
                  <Text style={styles.muted} numberOfLines={1}>
                    {v.channel}
                  </Text>
                )}
              </View>
              <Pressable style={styles.favBtn} onPress={() => remove.mutate(v.videoId)} accessibilityLabel="Remove from favorites" hitSlop={8}>
                <Icon name="heart" size={18} color={colors.accent} filled />
              </Pressable>
            </Pressable>
          ))}
        </>
      )}

      {panel === 'recent' && (
        <>
          {recent.length === 0 && <Text style={styles.muted}>Nothing played yet.</Text>}
          {recent.map((v) => (
            <Pressable
              key={v.videoId}
              style={styles.favRow}
              onPress={() => play(v.videoId, v.title, { channel: v.channel, thumbnail: v.thumbnail })}
              accessibilityLabel={`Play ${v.title}`}
            >
              {v.thumbnail ? <Image source={{ uri: v.thumbnail }} style={styles.favThumb} /> : <View style={styles.favThumb} />}
              <View style={styles.flex1}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {v.title}
                </Text>
                {!!v.channel && (
                  <Text style={styles.muted} numberOfLines={1}>
                    {v.channel}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </>
      )}

      {panel === null && (
        <>
      {badLink && <Text style={styles.error}>Type at least two letters, or paste a YouTube link.</Text>}
      {video.isFetching && <LoadingBars />}
      {video.isError && <Text style={styles.error}>{video.error instanceof Error ? video.error.message : "Couldn't fetch that video."}</Text>}

      {result && (
        <View style={styles.card}>
          <Pressable
            onPress={() => play(result.videoId, result.title, { channel: result.channel, thumbnail: result.thumbnail })}
            accessibilityLabel={`Play ${result.title}`}
          >
            {result.thumbnail ? <Image source={{ uri: result.thumbnail }} style={styles.thumb} /> : <View style={styles.thumb} />}
          </Pressable>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {result.title}
          </Text>
          <Text style={styles.muted}>
            {result.channel}
            {formatDuration(result.durationSeconds) ? ` · ${formatDuration(result.durationSeconds)}` : ''}
          </Text>
          <View style={styles.row}>
            <Pressable
              style={styles.playBtn}
              onPress={() => play(result.videoId, result.title, { channel: result.channel, thumbnail: result.thumbnail })}
              accessibilityLabel={`Play ${result.title}`}
            >
              <Icon name="play" size={18} color={colors.onAccent} />
              <Text style={styles.playBtnText}>Play</Text>
            </Pressable>
            <Pressable
              style={styles.favBtn}
              onPress={() => toggleFavorite(result.videoId, result.title, result.channel, result.thumbnail)}
              accessibilityLabel={isFavorite(result.videoId) ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Icon name="heart" size={20} color={colors.accent} filled={isFavorite(result.videoId)} />
            </Pressable>
          </View>
        </View>
      )}

      {query ? (
        <>
          <Text style={styles.sectionTitle}>Top hits for "{resultsLabel}"</Text>
          {videoRows(topHits.data?.results, {
            fetching: topHits.isFetching,
            error: topHits.error,
            configured: topHits.data?.configured,
          })}
          <Text style={styles.sectionTitle}>Latest for "{resultsLabel}"</Text>
          {videoRows(latest.data?.results, { fetching: latest.isFetching, error: latest.error, configured: latest.data?.configured })}
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>{popularTe.data?.note ? 'Popular music videos' : `Popular ${langName} hits`}</Text>
          {videoRows(popularTe.data?.results, { fetching: popularTe.isFetching, error: popularTe.error, configured: popularTe.data?.configured, note: popularTe.data?.note })}
          <Text style={styles.sectionTitle}>Latest {langName} songs</Text>
          {videoRows(latestTe.data?.results, { fetching: latestTe.isFetching, error: latestTe.error, configured: latestTe.data?.configured })}
        </>
      )}
      </>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  dropdown: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  dropItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dropText: { color: colors.text, fontSize: 15 },
  dropTextOn: { color: colors.accent, fontWeight: '600' },
  flex: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  muted: { color: colors.muted, fontSize: 14 },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  searchWrap: { justifyContent: 'center' },
  inputWithIcons: { paddingRight: 84 },
  clearX: { position: 'absolute', right: 48, height: 52, justifyContent: 'center' },
  searchIcon: { position: 'absolute', right: 14, height: 52, justifyContent: 'center' },
  panelBtn: { flex: 1, height: 36, paddingHorizontal: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  panelBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  panelBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  panelBtnTextOn: { color: colors.onAccent },
  error: { color: '#ff6b6b', fontSize: 14 },
  card: { gap: 8, backgroundColor: colors.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border },
  thumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: colors.surface2 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  playBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.accent },
  playBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  favBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  favRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  favThumb: { width: 84, height: 48, borderRadius: 8, backgroundColor: colors.surface2 },
  thumbWrap: { width: 84, height: 48 },
  durBadge: { position: 'absolute', right: 4, bottom: 4, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  durText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
}));
