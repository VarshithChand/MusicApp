import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlaylistMutations, usePlaylists } from '../api/hooks';
import { useSheet } from '../store/sheet';
import { colors } from '../theme/theme';
import { Icon } from './Icon';
import { NameModal } from './NameModal';

/** Bottom sheet listing the user's playlists for the song held in the sheet store. */
export function AddToPlaylistSheet() {
  const songId = useSheet((s) => s.songId);
  const close = useSheet((s) => s.close);
  const { data: playlists, isLoading } = usePlaylists();
  const { addSong, create } = usePlaylistMutations();
  const [naming, setNaming] = useState(false);

  const add = (id: number) => {
    if (songId == null) return;
    addSong.mutate({ id, songId }, { onSuccess: close });
  };

  const createAndAdd = (name: string) => {
    if (songId == null) return;
    create.mutate(name, {
      onSuccess: (playlist) => {
        setNaming(false);
        add(playlist.id);
      },
    });
  };

  return (
    <>
      <Modal visible={songId != null} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Add to playlist</Text>
            <Pressable style={styles.row} onPress={() => setNaming(true)}>
              <View style={styles.newIcon}>
                <Icon name="plus" color={colors.onAccent} />
              </View>
              <Text style={styles.name}>New playlist</Text>
            </Pressable>
            {isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(p) => String(p.id)}
                style={styles.list}
                renderItem={({ item }) => (
                  <Pressable style={styles.row} onPress={() => add(item.id)}>
                    <View style={styles.plIcon}>
                      <Icon name="library" color={colors.muted} />
                    </View>
                    <View>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.sub}>{item.song_count} songs</Text>
                    </View>
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <NameModal
        visible={naming}
        title="New playlist"
        confirmLabel="Create"
        onConfirm={createAndAdd}
        onClose={() => setNaming(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '70%' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 },
  newIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  plIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 13 },
});
