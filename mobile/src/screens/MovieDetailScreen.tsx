import { useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMovie } from '../api/hooks';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { SongRow } from '../components/SongRow';
import { playQueue } from '../player/controls';
import { colors, themedStyles } from '../theme/theme';

export interface MovieDetailParams {
  id: number;
}

/** A movie soundtrack: poster, details and its songs, each song's labels tapping through to the label browser. */
export function MovieDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { id } = useRoute<any>().params as MovieDetailParams;
  const { data: movie, isLoading, isError } = useMovie(id);

  const play = (index: number) => {
    if (!movie) return;
    playQueue(movie.songs, index).then(() => navigation.navigate('NowPlaying'));
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Back">
        <Icon name="back" size={26} color={colors.text} />
      </Pressable>

      {isLoading && <ActivityIndicator color={colors.accent} style={styles.spinner} />}
      {isError && <Text style={styles.muted}>This movie isn't available.</Text>}

      {movie && (
        <>
          <View style={styles.top}>
            <Cover id={movie.id} uri={movie.poster_url} size={160} radius={20} />
            <Text style={styles.h1}>{movie.title}</Text>
            <Text style={styles.sub}>
              {[movie.language, movie.release_year, movie.music_director && `Music: ${movie.music_director}`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {!!movie.description && <Text style={styles.desc}>{movie.description}</Text>}
            <Pressable
              style={[styles.playAll, !movie.songs.length && styles.disabled]}
              disabled={!movie.songs.length}
              onPress={() => play(0)}
              accessibilityRole="button"
            >
              <Icon name="play" size={20} color={colors.onAccent} />
              <Text style={styles.playAllText}>Play all</Text>
            </Pressable>
          </View>

          <Text style={styles.count}>
            {movie.songs.length} song{movie.songs.length === 1 ? '' : 's'}
          </Text>

          {movie.songs.map((s, i) => (
            <View key={s.id} style={styles.songBlock}>
              <SongRow song={s} onPress={() => play(i)} />
              {!!s.moods?.length && (
                <View style={styles.moodRow} accessibilityLabel="Moods">
                  {s.moods.map((slug) => (
                    <Pressable
                      key={slug}
                      style={styles.moodTag}
                      onPress={() => navigation.navigate('Search', { label: slug })}
                    >
                      <Text style={styles.moodText}>{slug}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 4 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  spinner: { marginTop: 40 },
  muted: { color: colors.muted, fontSize: 15, marginTop: 24 },
  top: { alignItems: 'flex-start', gap: 6, marginTop: 8, marginBottom: 8 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, marginTop: 10 },
  sub: { color: colors.muted, fontSize: 14 },
  desc: { color: colors.text, fontSize: 14, marginTop: 6, lineHeight: 20 },
  playAll: {
    marginTop: 12,
    alignSelf: 'flex-start',
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playAllText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  count: { color: colors.muted, fontSize: 13, marginTop: 20, marginBottom: 4 },
  songBlock: { marginBottom: 4 },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 64, marginTop: -4, marginBottom: 8 },
  moodTag: { paddingHorizontal: 10, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  moodText: { color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
}));
