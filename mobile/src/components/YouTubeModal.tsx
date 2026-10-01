import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors } from '../theme/theme';
import { Icon } from './Icon';

interface Props {
  videoId: string | null;
  title: string;
  onClose: () => void;
}

// YouTube refuses embeds that arrive without a referrer, so the player page is loaded with our website as its base URL.
const BASE_URL = 'https://music.deploymentportal.in';

const playerHtml = (videoId: string) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&playsinline=1"
  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
</body></html>`;

/**
 * Plays a video in YouTube's own embedded player. The player stays visible and unmodified (YouTube's terms);
 * nothing is downloaded or stored.
 */
export function YouTubeModal({ videoId, title, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!videoId} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close player">
            <Icon name="chevronDown" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {videoId && (
          <View style={styles.video}>
            <WebView
              source={{ html: playerHtml(videoId), baseUrl: BASE_URL }}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              style={styles.web}
            />
          </View>
        )}
        <Text style={styles.note}>Playing from YouTube.</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  note: { color: colors.muted, fontSize: 13, padding: 16 },
});
