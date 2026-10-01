import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArtists, useRecentlyPlayed, useSongs } from '../api/hooks';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { SongRow } from '../components/SongRow';
import { playQueue } from '../player/controls';
import { useAuth } from '../store/auth';
import { colors } from '../theme/theme';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const logout = useAuth((s) => s.logout);
  const recent = useRecentlyPlayed();
  const popular = useSongs('popular');
  const artists = useArtists();

  const play = (songs: typeof popular.data, index: number) => {
    if (!songs) return;
    playQueue(songs, index).then(() => navigation.navigate('NowPlaying'));
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.h1}>{greeting()}</Text>
        <Pressable style={styles.avatar} onPress={logout} accessibilityLabel="Log out">
          <Icon name="user" size={22} color={colors.text} />
        </Pressable>
      </View>

      {popular.isLoading && <ActivityIndicator color={colors.accent} />}
      {popular.isError && <Text style={styles.error}>Couldn't load music. Check your connection.</Text>}

      {!!recent.data?.length && (
        <View style={styles.section}>
          <Text style={styles.h2}>Recently played</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
            {recent.data.map((s, i) => (
              <Pressable key={s.id} style={styles.card} onPress={() => play(recent.data, i)}>
                <Cover id={s.id} uri={s.cover_url} size={108} radius={16} />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {s.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {!!popular.data?.length && (
        <View style={styles.section}>
          <Text style={styles.h2}>Popular</Text>
          {popular.data.slice(0, 10).map((s, i) => (
            <SongRow key={s.id} song={s} onPress={() => play(popular.data, i)} />
          ))}
        </View>
      )}

      {!!artists.data?.length && (
        <View style={styles.section}>
          <Text style={styles.h2}>Artists</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
            {artists.data.map((a) => (
              <Pressable
                key={a.id}
                style={styles.artist}
                onPress={() =>
                  navigation.navigate('SongList', { title: a.name, path: `/artists/${a.id}/songs` })
                }
              >
                <Cover id={a.id} uri={a.image_url} size={76} radius={38} />
                <Text style={styles.artistName} numberOfLines={1}>
                  {a.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 6 },
  h2: { color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8 },
  hrow: { gap: 14 },
  card: { width: 108, gap: 8 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  artist: { width: 76, alignItems: 'center', gap: 8 },
  artistName: { color: colors.text, fontSize: 13, fontWeight: '500' },
  error: { color: colors.danger, fontSize: 14 },
});
