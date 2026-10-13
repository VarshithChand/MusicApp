import { useNavigation } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToggleYouTubeFavorite, useYouTubeFavorites, useYouTubeVideo } from '../api/hooks';
import { Icon } from '../components/Icon';
import { YouTubeModal } from '../components/YouTubeModal';
import { colors } from '../theme/theme';

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

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export function YouTubeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [text, setText] = useState('');
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [badLink, setBadLink] = useState(false);
  const [playing, setPlaying] = useState<{ videoId: string; title: string } | null>(null);
  const video = useYouTubeVideo(lookupId);
  const favorites = useYouTubeFavorites();
  const { add, remove } = useToggleYouTubeFavorite();

  const fetchDetails = () => {
    const id = parseVideoId(text);
    if (!id) {
      setBadLink(true);
      setLookupId(null);
      return;
    }
    setBadLink(false);
    setLookupId(id);
  };

  const paste = async () => {
    const clip = await Clipboard.getString();
    if (clip) setText(clip);
  };

  const isFavorite = (id: string) => !!favorites.data?.some((v) => v.videoId === id);
  const toggleFavorite = (id: string, title: string, channel: string | null, thumbnail: string | null) => {
    if (isFavorite(id)) remove.mutate(id);
    else add.mutate({ videoId: id, title, channel, thumbnail });
  };

  const result = video.data?.video;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>YouTube</Text>
      </View>
      <Text style={styles.muted}>Paste a link, watch it here, and save the ones you want to find again.</Text>

      <View>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            setBadLink(false);
          }}
          placeholder="https://youtube.com/watch?v=..."
          placeholderTextColor="#7C8391"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={fetchDetails}
          accessibilityLabel="YouTube link"
        />
        <View style={styles.row}>
          <Pressable style={styles.smallBtn} onPress={paste} accessibilityLabel="Paste">
            <Text style={styles.smallBtnText}>Paste</Text>
          </Pressable>
          <Pressable style={styles.smallBtn} onPress={() => setText('')} accessibilityLabel="Clear">
            <Text style={styles.smallBtnText}>Clear</Text>
          </Pressable>
          <View style={styles.flex1} />
          <Pressable style={styles.fetchBtn} onPress={fetchDetails} disabled={!text.trim()} accessibilityLabel="Fetch video details">
            <Text style={styles.fetchBtnText}>Fetch Video Details</Text>
          </Pressable>
        </View>
      </View>

      {badLink && <Text style={styles.error}>That doesn't look like a YouTube link. Try pasting the full URL.</Text>}
      {video.isFetching && <ActivityIndicator color={colors.accent} />}
      {video.isError && <Text style={styles.error}>Couldn't fetch that video. It may be private, removed, or embedding may be disabled.</Text>}

      {result && (
        <View style={styles.card}>
          {result.thumbnail ? <Image source={{ uri: result.thumbnail }} style={styles.thumb} /> : <View style={styles.thumb} />}
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
              onPress={() => setPlaying({ videoId: result.videoId, title: result.title })}
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

      <Text style={styles.sectionTitle}>Favorites</Text>
      {favorites.isLoading && <ActivityIndicator color={colors.accent} />}
      {favorites.isSuccess && favorites.data.length === 0 && <Text style={styles.muted}>Nothing saved yet.</Text>}
      {favorites.data?.map((v) => (
        <Pressable key={v.videoId} style={styles.favRow} onPress={() => setPlaying({ videoId: v.videoId, title: v.title })}>
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

      <YouTubeModal videoId={playing?.videoId ?? null} title={playing?.title ?? ''} onClose={() => setPlaying(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
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
  smallBtn: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  smallBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  fetchBtn: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.accent, justifyContent: 'center' },
  fetchBtnText: { color: colors.onAccent, fontSize: 13, fontWeight: '700' },
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
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
