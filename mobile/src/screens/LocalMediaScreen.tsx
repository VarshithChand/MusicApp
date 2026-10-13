import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasLocalMediaPermission, listLocalAudio, listLocalVideo, requestLocalMediaPermission } from '../api/localMedia';
import { LocalAudioFile, LocalVideoFile } from '../api/types';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { LocalMediaRow } from '../components/LocalMediaRow';
import { LocalVideoModal } from '../components/LocalVideoModal';
import { useLocalFavorites } from '../store/localFavorites';
import { playLocalQueue } from '../player/controls';
import { colors } from '../theme/theme';

type Tab = 'audio' | 'video';
type LoadState = 'checking' | 'denied' | 'loading' | 'ready' | 'error';

export function LocalMediaScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('audio');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<LoadState>('checking');
  const [audio, setAudio] = useState<LocalAudioFile[]>([]);
  const [video, setVideo] = useState<LocalVideoFile[]>([]);
  const [playingVideo, setPlayingVideo] = useState<{ uri: string; title: string } | null>(null);
  const favoriteAudio = useLocalFavorites((s) => s.audio);
  const favoriteVideo = useLocalFavorites((s) => s.video);

  const load = useCallback(async (which: Tab) => {
    setState('checking');
    const already = await hasLocalMediaPermission(which);
    const granted = already || (await requestLocalMediaPermission(which));
    if (!granted) {
      setState('denied');
      return;
    }
    setState('loading');
    try {
      if (which === 'audio') setAudio(await listLocalAudio());
      else setVideo(await listLocalVideo());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (tab === 'audio') {
      return audio
        .filter((a) => !onlyFavorites || favoriteAudio.includes(a.uri))
        .filter((a) => !q || a.title.toLowerCase().includes(q) || (a.artist ?? '').toLowerCase().includes(q));
    }
    return video
      .filter((v) => !onlyFavorites || favoriteVideo.includes(v.uri))
      .filter((v) => !q || v.title.toLowerCase().includes(q));
  }, [tab, audio, video, onlyFavorites, favoriteAudio, favoriteVideo, query]);

  const openSettings = () => Linking.openSettings();

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>Local Media</Text>
      </View>

      <View style={styles.chips}>
        <Chip label="Audio" active={tab === 'audio'} onPress={() => setTab('audio')} />
        <Chip label="Video" active={tab === 'video'} onPress={() => setTab('video')} />
        <Chip label="Favorites" active={onlyFavorites} onPress={() => setOnlyFavorites((v) => !v)} />
      </View>

      {state === 'ready' && (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tab === 'audio' ? 'Search songs' : 'Search videos'}
          placeholderTextColor="#7C8391"
          style={styles.search}
          autoCorrect={false}
        />
      )}

      {(state === 'checking' || state === 'loading') && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {state === 'denied' && (
        <View style={styles.centerBox}>
          <Text style={styles.msgTitle}>Permission needed</Text>
          <Text style={styles.msg}>
            Musica needs permission to see the {tab} already on this phone. Nothing is uploaded — it only reads the list and plays what you tap.
          </Text>
          <Pressable style={styles.retryBtn} onPress={() => load(tab)} accessibilityLabel="Try again">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
          <Pressable onPress={openSettings} accessibilityLabel="Open app settings">
            <Text style={styles.linkText}>Open app settings</Text>
          </Pressable>
        </View>
      )}

      {state === 'error' && (
        <View style={styles.centerBox}>
          <Text style={styles.msg}>Couldn't read the {tab} library right now.</Text>
          <Pressable style={styles.retryBtn} onPress={() => load(tab)} accessibilityLabel="Try again">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && (
        <FlatList
          data={filtered as (LocalAudioFile | LocalVideoFile)[]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.msg}>{onlyFavorites ? 'No favorites yet.' : query ? 'No matches.' : `No ${tab} found on this phone.`}</Text>
            </View>
          }
          renderItem={({ item, index }) =>
            tab === 'audio' ? (
              <LocalMediaRow kind="audio" item={item as LocalAudioFile} onPress={() => playLocalQueue(filtered as LocalAudioFile[], index).then(() => navigation.navigate('NowPlaying'))} />
            ) : (
              <LocalMediaRow kind="video" item={item as LocalVideoFile} onPress={() => setPlayingVideo({ uri: (item as LocalVideoFile).uri, title: item.title })} />
            )
          }
        />
      )}

      <LocalVideoModal uri={playingVideo?.uri ?? null} title={playingVideo?.title ?? ''} onClose={() => setPlayingVideo(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 20 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 16 },
  search: {
    marginHorizontal: 20,
    marginTop: 12,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
  },
  list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 4 },
  centerBox: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 48, gap: 12 },
  msgTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  msg: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: { height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  linkText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
