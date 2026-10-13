import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { Icon } from '../components/Icon';
import { useSettings } from '../store/settings';
import { colors, themedStyles } from '../theme/theme';

const PRESETS = [100, 125, 150, 200];

export function VolumeBoostScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const boost = useSettings((s) => s.boost);
  const update = useSettings((s) => s.update);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>Volume boost</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.muted}>Current boost</Text>
        <Text style={styles.value}>{boost}%</Text>
        <Text style={styles.muted}>100% is normal. Higher values play louder than the phone's own volume.</Text>
      </View>

      <Text style={styles.h2}>Choose a level</Text>
      <View style={styles.pills}>
        {PRESETS.map((p) => {
          const on = boost === p;
          return (
            <Pressable
              key={p}
              style={[styles.pill, on && styles.pillOn]}
              onPress={() => update({ boost: p })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{p}%</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.reset} onPress={() => update({ boost: 100 })} accessibilityRole="button">
        <Text style={styles.resetText}>Reset to normal</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  h2: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 8 },
  muted: { color: colors.muted, fontSize: 14 },
  card: { gap: 6, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  value: { color: colors.accent, fontSize: 40, fontWeight: '700' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  pillTextOn: { color: colors.onAccent },
  reset: { height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  resetText: { color: colors.text, fontSize: 15, fontWeight: '600' },
}));
