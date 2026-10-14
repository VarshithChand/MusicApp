import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Pressable, TextInput, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import { LoadingBars } from '../components/LoadingBars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteLocalMedia, hasLocalMediaPermission, listLocalAudio, listLocalVideo, requestLocalMediaPermission } from '../api/localMedia';
import { LocalAudioFile, LocalVideoFile } from '../api/types';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { LocalMediaRow } from '../components/LocalMediaRow';
import { LocalVideoModal } from '../components/LocalVideoModal';
import { OfflineBanner } from '../components/OfflineBanner';
import { useLocalFavorites } from '../store/localFavorites';
import { playLocalQueue } from '../player/controls';
import { colors, themedStyles } from '../theme/theme';

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
  const [menuFor, setMenuFor] = useState<{ uri: string; title: string } | null>(null);
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

  const videoIndex = playingVideo ? filtered.findIndex((v) => (v as LocalVideoFile).uri === playingVideo.uri) : -1;
  const stepVideo = (delta: 1 | -1) => {
    const next = (filtered as LocalVideoFile[])[videoIndex + delta];
    if (next) setPlayingVideo({ uri: next.uri, title: next.title });
  };

  // The file is gone from the phone, so drop it from the list rather than rescanning the whole library.
  const forget = (uri: string) => {
    setAudio((list) => list.filter((a) => a.uri !== uri));
    setVideo((list) => list.filter((v) => v.uri !== uri));
    if (playingVideo?.uri === uri) setPlayingVideo(null);
  };

  const confirmDelete = (target: { uri: string; title: string }) => {
    setMenuFor(null);
    Alert.alert('Delete from this phone?', `"${target.title}" will be deleted from this phone for good.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // From Android 11 the system asks as well; false means the owner said no there.
            if (await deleteLocalMedia(target.uri)) forget(target.uri);
          } catch (e) {
            Alert.alert("Couldn't delete", e instanceof Error ? e.message : 'That file is still on this phone.');
          }
        },
      },
    ]);
  };

  const openSettings = () => Linking.openSettings();

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <Text style={[styles.h1, styles.h1Padded]}>Local Media</Text>
      <OfflineBanner />

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
          <LoadingBars />
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
              <LocalMediaRow
                kind="audio"
                item={item as LocalAudioFile}
                onPress={() => playLocalQueue(filtered as LocalAudioFile[], index).then(() => navigation.navigate('NowPlaying'))}
                onDelete={() => setMenuFor({ uri: item.uri, title: item.title })}
              />
            ) : (
              <LocalMediaRow
                kind="video"
                item={item as LocalVideoFile}
                onPress={() => setPlayingVideo({ uri: (item as LocalVideoFile).uri, title: item.title })}
                onDelete={() => setMenuFor({ uri: item.uri, title: item.title })}
              />
            )
          }
        />
      )}

      <Modal visible={!!menuFor} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuFor(null)} accessibilityLabel="Close menu">
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} numberOfLines={2}>
              {menuFor?.title}
            </Text>
            <Pressable
              style={styles.sheetItem}
              onPress={() => menuFor && confirmDelete(menuFor)}
              accessibilityLabel="Delete from this phone"
            >
              <Icon name="trash" size={20} color={colors.danger} />
              <Text style={styles.sheetDanger}>Delete from this phone</Text>
            </Pressable>
            <Pressable style={styles.sheetItem} onPress={() => setMenuFor(null)} accessibilityLabel="Cancel">
              <Text style={styles.sheetCancel}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <LocalVideoModal
        uri={playingVideo?.uri ?? null}
        title={playingVideo?.title ?? ''}
        onClose={() => setPlayingVideo(null)}
        onPrev={videoIndex > 0 ? () => stepVideo(-1) : undefined}
        onNext={videoIndex >= 0 && videoIndex < filtered.length - 1 ? () => stepVideo(1) : undefined}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  h1Padded: { paddingHorizontal: 20, marginTop: 24 },
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
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 4 },
  sheetTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 },
  sheetDanger: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  sheetCancel: { color: colors.muted, fontSize: 15, fontWeight: '600' },
}));
