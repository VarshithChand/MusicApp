import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { colors, themedStyles } from '../theme/theme';
import { Icon } from './Icon';

interface Props {
  uri: string | null;
  title: string;
  onClose: () => void;
}

/** Plays a video already on the phone. Nothing leaves the device. */
export function LocalVideoModal({ uri, title, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [error, setError] = useState(false);

  return (
    <Modal visible={!!uri} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close player">
            <Icon name="chevronDown" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {uri && !error && (
          <Video
            source={{ uri }}
            style={styles.video}
            controls
            resizeMode="contain"
            onError={() => setError(true)}
          />
        )}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>This video couldn't be played. It may use a format this phone doesn't support, or the file may have moved.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  video: { flex: 1, backgroundColor: '#000' },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: colors.muted, fontSize: 14, textAlign: 'center' },
}));
