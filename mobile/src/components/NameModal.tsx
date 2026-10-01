import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/theme';

interface Props {
  visible: boolean;
  title: string;
  initial?: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

/** Small dialog asking for a single name (create / rename playlist). */
export function NameModal({ visible, title, initial = '', confirmLabel, onConfirm, onClose }: Props) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (visible) setName(initial);
  }, [visible, initial]);

  const trimmed = name.trim();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            maxLength={100}
            accessibilityLabel="Playlist name"
          />
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirm, !trimmed && styles.disabled]}
              disabled={!trimmed}
              onPress={() => onConfirm(trimmed)}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 16 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancel: { height: 44, paddingHorizontal: 16, justifyContent: 'center' },
  cancelText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  confirm: { height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.accent, justifyContent: 'center' },
  confirmText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
