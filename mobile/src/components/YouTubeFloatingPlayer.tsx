import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, StatusBar, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useTrending } from '../api/hooks';
import { useYouTubePlayer } from '../store/youtubePlayer';
import { colors, themedStyles } from '../theme/theme';
import { Icon } from './Icon';
import { useVideoGestures } from './useVideoGestures';

// YouTube refuses embeds that arrive without a referrer, so the player page is loaded with our website as its base URL.
const BASE_URL = 'https://music.deploymentportal.in';

// enablejsapi + origin let the page hear YouTube's state changes; state 0 means the video has ended.
const playerHtml = (videoId: string) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe id="yt" src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(BASE_URL)}"
  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
<script>
var frame = document.getElementById('yt');
frame.addEventListener('load', function () {
  frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'yt', channel: 'widget' }), 'https://www.youtube.com');
});
var now = 0;
var state = -1;
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://www.youtube.com') return;
  var d;
  try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
  if (!d || d.event !== 'infoDelivery' || !d.info) return;
  if (typeof d.info.currentTime === 'number') now = d.info.currentTime;
  if (typeof d.info.playerState === 'number') state = d.info.playerState;
  if (d.info.playerState === 0) window.ReactNativeWebView.postMessage('ended');
});
function setVol(v) {
  frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [v] }), 'https://www.youtube.com');
}
function togglePlay() {
  frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: state === 1 ? 'pauseVideo' : 'playVideo', args: [] }), 'https://www.youtube.com');
}
function seekBy(seconds) {
  frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [Math.max(0, now + seconds), true] }), 'https://www.youtube.com');
}
</script>
</body></html>`;

/**
 * The one YouTube player for the whole app (mounted once at the root, see App.tsx — the same pattern as
 * AddToPlaylistSheet). Full-screen while actively opened; tapping the down-arrow shrinks it to a small box in the
 * bottom-right corner that keeps playing while the owner browses the rest of the app, the same idea as the audio
 * MiniPlayer. The <WebView> stays the same element across both modes (only the surrounding box's size/position
 * changes), so shrinking or expanding never reloads the video.
 */
export function YouTubeFloatingPlayer() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { videoId, title, mode, minimize, maximize, close, play, playNext, autoplay, setAutoplay } = useYouTubePlayer();
  const related = useTrending('popular');
  const webRef = useRef<React.ComponentRef<typeof WebView>>(null);
  // Our own landscape view: YouTube's in-player fullscreen button depends on the phone's WebView and
  // auto-rotate setting and doesn't work everywhere, so this rotates the same player to fill the screen.
  const [landscape, setLandscape] = useState(false);
  const mini = mode === 'mini';

  useEffect(() => {
    if (mini || !videoId) setLandscape(false);
  }, [mini, videoId]);

  useEffect(() => {
    if (!videoId || mini) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (landscape) setLandscape(false);
      else minimize();
      return true;
    });
    return () => sub.remove();
  }, [videoId, mini, landscape, minimize]);

  const inject = (js: string) => webRef.current?.injectJavaScript(`${js}; true;`);
  const gestures = useVideoGestures({
    rotated: landscape && height > width,
    onSeek: (delta) => inject(`seekBy(${delta})`),
    onTogglePlay: () => inject('togglePlay()'),
    onVolume: (level) => inject(`setVol(${Math.round(level * 100)})`),
  });
  const hud = gestures.hud;

  if (!videoId) return null;

  // Rotate only while the phone itself is upright; if it's already sideways, just fill the screen.
  const landscapeBox =
    height > width
      ? { width: height, height: width, left: (width - height) / 2, top: (height - width) / 2, transform: [{ rotate: '90deg' }] }
      : { width, height, left: 0, top: 0 };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        mini
          ? styles.miniRoot
          : landscape
            ? styles.landRoot
            : [styles.fullRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }],
      ]}
    >
      {!mini && !landscape && (
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={minimize} accessibilityLabel="Minimize player">
            <Icon name="chevronDown" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Pressable style={styles.iconBtn} onPress={() => setLandscape(true)} accessibilityLabel="Full screen">
            <Icon name="expand" size={22} color={colors.text} />
          </Pressable>
        </View>
      )}
      <View style={mini ? styles.miniBox : landscape ? [styles.landBox, landscapeBox] : styles.fullBox}>
        <WebView
          ref={webRef}
          source={{ html: playerHtml(videoId), baseUrl: BASE_URL }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          allowsFullscreenVideo
          onMessage={(e) => {
            if (e.nativeEvent.data === 'ended') playNext();
          }}
          pointerEvents={mini ? 'none' : 'auto'}
          style={styles.web}
        />
        {!mini && (
          <>
            <View
              style={styles.gestureZone}
              onLayout={gestures.onLayout}
              {...gestures.panHandlers}
            />
            {hud && (
              <View style={styles.hud} pointerEvents="none">
                <Text style={styles.hudText}>{hud}</Text>
              </View>
            )}
          </>
        )}
        {mini && (
          <>
            <Pressable style={styles.miniTap} onPress={maximize} accessibilityLabel={`Open ${title}`} />
            <Pressable style={styles.miniClose} onPress={close} accessibilityLabel="Close player" hitSlop={8}>
              <Icon name="close" size={14} color="#fff" />
            </Pressable>
          </>
        )}
        {landscape && (
          <Pressable style={styles.landExit} onPress={() => setLandscape(false)} accessibilityLabel="Exit full screen" hitSlop={8}>
            <Icon name="close" size={20} color="#fff" />
          </Pressable>
        )}
      </View>
      {!mini && !landscape && (
        <ScrollView style={styles.upNext} contentContainerStyle={styles.upNextContent}>
          <View style={styles.switchRow}>
            <Text style={styles.toggleText}>Autoplay next</Text>
            <Switch
              value={autoplay}
              onValueChange={setAutoplay}
              trackColor={{ false: colors.surface2, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.upNextTitle}>Up next</Text>
          {related.data?.results
            .filter((r) => r.videoId !== videoId)
            .map((r) => (
              <Pressable key={r.videoId} style={styles.upNextRow} onPress={() => play(r.videoId, r.title)} accessibilityLabel={`Play ${r.title}`}>
                {r.thumbnail ? <Image source={{ uri: r.thumbnail }} style={styles.upNextThumb} /> : <View style={styles.upNextThumb} />}
                <View style={styles.flex1}>
                  <Text style={styles.upNextRowTitle} numberOfLines={2}>
                    {r.title}
                  </Text>
                  <Text style={styles.channel} numberOfLines={1}>
                    {r.channel}
                  </Text>
                </View>
              </Pressable>
            ))}
        </ScrollView>
      )}
      <StatusBar hidden={landscape} />
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fullRoot: { backgroundColor: colors.bg },
  // Flex alignment (not raw top/right/bottom/left math) to place the mini box at the bottom-right: pushes it there
  // along both axes, which is the well-tested way to anchor a corner element in this layout engine.
  miniRoot: { justifyContent: 'flex-end', alignItems: 'flex-end', paddingRight: 16, paddingBottom: 170 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  fullBox: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  landRoot: { backgroundColor: '#000' },
  landBox: { position: 'absolute', backgroundColor: '#000' },
  landExit: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  web: { flex: 1, backgroundColor: '#000' },
  upNext: { flex: 1 },
  upNextContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  gestureZone: { position: 'absolute', top: 0, left: 0, right: 0, height: '75%' },
  hud: { position: 'absolute', top: '35%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 16, zIndex: 10, elevation: 10 },
  hudText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  toggleText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  upNextTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 4 },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  upNextThumb: { width: 120, height: 68, borderRadius: 8, backgroundColor: colors.surface2 },
  upNextRowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  channel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  flex1: { flex: 1 },
  miniBox: {
    width: 168,
    height: 94,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  miniTap: { ...StyleSheet.absoluteFill },
  miniClose: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
