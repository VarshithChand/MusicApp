import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { useFilteredSongs, useMoods } from '../api/hooks';
import { MoodCount } from '../api/types';
import { playQueue } from '../player/controls';
import { colors, themedStyles } from '../theme/theme';
import { Chip } from './Chip';
import { SongRow } from './SongRow';

const LANGUAGES = ['Telugu', 'Hindi', 'Tamil', 'Kannada', 'Malayalam', 'English'];
const KIND_TITLES: Record<MoodCount['kind'], string> = { style: 'Style', mood: 'Mood', genre: 'Genre' };

/**
 * Style, mood and genre chips; a song must carry ALL chosen labels ("Melody" + "Romantic"). Mirrors the website's
 * MoodBrowser. Only labels an admin has approved on a published song are offered.
 */
export function LabelBrowser({ initialLabel }: { initialLabel?: string }) {
  const navigation = useNavigation<any>();
  const [chosen, setChosen] = useState<string[]>(initialLabel ? [initialLabel] : []);
  const [language, setLanguage] = useState('');
  const moods = useMoods();
  const songs = useFilteredSongs({ labels: chosen, language });

  const toggleLabel = (slug: string) => setChosen((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  const toggleLanguage = (value: string) => setLanguage((prev) => (prev.toLowerCase() === value.toLowerCase() ? '' : value));

  const available = (moods.data ?? []).filter((m) => m.song_count > 0);
  if (!available.length && !chosen.length && !language) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.h2}>Browse by label</Text>

      {(['style', 'mood', 'genre'] as const).map((kind) => {
        const labels = available.filter((m) => m.kind === kind);
        if (!labels.length) return null;
        return (
          <View key={kind} style={styles.group}>
            <Text style={styles.groupLabel}>{KIND_TITLES[kind]}</Text>
            <View style={styles.chips}>
              {labels.map((m) => (
                <Chip key={m.slug} label={m.name} active={chosen.includes(m.slug)} onPress={() => toggleLabel(m.slug)} />
              ))}
            </View>
          </View>
        );
      })}

      <View style={styles.group}>
        <Text style={styles.groupLabel}>Language</Text>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => (
            <Chip key={l} label={l} active={language.toLowerCase() === l.toLowerCase()} onPress={() => toggleLanguage(l)} />
          ))}
        </View>
      </View>

      {(chosen.length > 0 || language) && (
        <View style={styles.results}>
          {chosen.length > 1 && <Text style={styles.muted}>Songs with all of the selected labels.</Text>}
          {songs.isFetching && <ActivityIndicator color={colors.accent} />}
          {songs.data && !songs.data.length && <Text style={styles.muted}>No songs match these filters yet. Try removing one.</Text>}
          {songs.data?.map((s, i) => (
            <SongRow
              key={s.id}
              song={s}
              subtitle={[s.artist_name, s.album_title].filter(Boolean).join(' · ')}
              onPress={() => playQueue(songs.data!, i).then(() => navigation.navigate('NowPlaying'))}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  section: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.surface2, gap: 12 },
  h2: { color: colors.text, fontSize: 18, fontWeight: '600' },
  group: { gap: 8 },
  groupLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  results: { gap: 4, marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14 },
}));
