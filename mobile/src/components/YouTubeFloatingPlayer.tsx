import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useYouTubePlayer } from '../store/youtubePlayer';
import { colors } from '../theme/theme';
import { Icon } from './Icon';

// YouTube refuses embeds that arrive without a referrer, so the player page is loaded with our website as its base URL.
const BASE_URL = 'https://music.deploymentportal.in';

const playerHtml = (videoId: string) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1"
  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
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
  const { videoId, title, mode, minimize, maximize, close } = useYouTubePlayer();
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
      <Pressable
        style={mini ? styles.miniBox : landscape ? [styles.landBox, landscapeBox] : styles.fullBox}
        onPress={mini ? maximize : undefined}
        accessibilityLabel={mini ? `Open ${title}` : undefined}
      >
        <WebView
          source={{ html: playerHtml(videoId), baseUrl: BASE_URL }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          allowsFullscreenVideo
          // In mini mode the WebView itself shouldn't eat taps meant to re-open the player.
          pointerEvents={mini ? 'none' : 'auto'}
          style={styles.web}
        />
        {mini && (
          <Pressable style={styles.miniClose} onPress={close} accessibilityLabel="Close player" hitSlop={8}>
            <Icon name="close" size={14} color="#fff" />
          </Pressable>
        )}
        {landscape && (
          <Pressable style={styles.landExit} onPress={() => setLandscape(false)} accessibilityLabel="Exit full screen" hitSlop={8}>
            <Icon name="close" size={20} color="#fff" />
          </Pressable>
        )}
      </Pressable>
      {!mini && !landscape && <Text style={styles.note}>Playing from YouTube. Tap the corners icon for full screen.</Text>}
      <StatusBar hidden={landscape} />
    </View>
  );
}

const styles = StyleSheet.create({
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
  note: { color: colors.muted, fontSize: 13, padding: 16 },
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
});
