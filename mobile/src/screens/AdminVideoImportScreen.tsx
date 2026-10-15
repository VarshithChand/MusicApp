import Clipboard from '@react-native-clipboard/clipboard';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useImportedVideoSummary, useImportVideos, VideoImportReport } from '../api/hooks';
import { AppText as Text } from '../components/AppText';
import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { LoadingBars } from '../components/LoadingBars';
import { LANGUAGES, languageLabel } from '../data/languages';
import { colors, themedStyles } from '../theme/theme';

const LIST_LABEL: Record<string, string> = { latest: 'Latest', trending: 'Trending', popular: 'Popular' };

/**
 * The words to give an AI. They ask for real links only and spell out the exact shape this page reads, so
 * the answer can be pasted straight back. The server still checks every link with YouTube regardless.
 */
function promptFor(code: string, name: string): string {
  return `You are helping me fill a music app with YouTube videos.

Search YouTube and the web now, and find real, currently available YouTube music videos in ${name}:
- 15 "latest": songs released in the last 30 days
- 15 "trending": songs being watched most right now
- 15 "popular": the most popular ${name} songs of the past year

Rules:
- Use only real YouTube links you have actually found. Never guess or invent a video ID. If you cannot search the web, say so instead of making links up.
- Prefer official channels: music labels, film studios, or the artist's own channel.
- Full songs, video songs or official lyric videos only. No Shorts, jukebox compilations, reaction videos or covers.
- You may tag each song with ONE mood from this list: mass, class, riding, traveling, alone, sad, romantic, party. Leave "mood" out if unsure.

Reply with ONLY this JSON and no other text:
{
  "language": "${code}",
  "videos": [
    { "url": "https://www.youtube.com/watch?v=VIDEO_ID", "title": "Song title", "list": "latest", "mood": "mass" }
  ]
}
"list" must be one of: latest, trending, popular.`;
}

/** Pulls the JSON out of an AI's reply, which often wraps it in ``` fences or adds a sentence around it. */
function readReply(text: string): { value?: { language?: string; videos: unknown[] }; error?: string } {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) return { error: "That doesn't contain a JSON list. Paste the AI's whole reply." };
  try {
    const value = JSON.parse(unfenced.slice(start, end + 1));
    if (!Array.isArray(value?.videos)) return { error: 'The reply has no "videos" list in it.' };
    if (!value.videos.length) {
      // The prompt tells the AI to find nothing rather than invent links, which is what an empty list usually means.
      return { error: "The AI found no videos -- most likely it can't search the web. Turn on web search (or use Gemini or Perplexity) and ask again." };
    }
    return { value };
  } catch {
    return { error: "The reply isn't valid JSON. Ask the AI to answer with only the JSON, then paste it again." };
  }
}

export function AdminVideoImportScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const summary = useImportedVideoSummary();
  const importer = useImportVideos();
  const [language, setLanguage] = useState('te');
  const [reply, setReply] = useState('');
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<VideoImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const name = languageLabel(language);
  const prompt = promptFor(language, name);

  const copy = () => {
    Clipboard.setString(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const run = (dryRun: boolean) => {
    setReport(null);
    setError(null);
    const { value, error: problem } = readReply(reply);
    if (!value) {
      setError(problem!);
      return;
    }
    importer.mutate(
      // The reply's own language wins if it names one; otherwise the one picked above.
      { language: value.language ?? language, videos: value.videos, dryRun },
      {
        onSuccess: setReport,
        onError: (e) => setError(e instanceof Error ? e.message : 'The import could not be completed.'),
      },
    );
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <Icon name="back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>Video import</Text>
      </View>
      <Text style={styles.muted}>
        Fill the home rows with videos found by any AI. Every link is checked with YouTube before it is kept, so made-up or
        unplayable ones are turned away.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>In the app now</Text>
        {summary.isLoading && <LoadingBars />}
        {summary.data && !summary.data.length && <Text style={styles.muted}>Nothing imported yet.</Text>}
        {summary.data?.map((s) => (
          <Text key={`${s.language}:${s.list}`} style={styles.body}>
            {languageLabel(s.language)} · {LIST_LABEL[s.list] ?? s.list}: {s.videos} videos, imported{' '}
            {new Date(s.imported_at).toLocaleDateString()}
          </Text>
        ))}
      </View>

      <Text style={styles.step}>1. Choose the language</Text>
      <View style={styles.chips}>
        {LANGUAGES.map((l) => (
          <Chip key={l.key} label={l.label} active={language === l.key} onPress={() => setLanguage(l.key)} />
        ))}
      </View>

      <Text style={styles.step}>2. Give this to any AI</Text>
      <Text style={styles.muted}>Use one that can search the web (ChatGPT with search, Gemini, Perplexity). Others tend to invent links.</Text>
      <View style={styles.card}>
        <ScrollView style={styles.promptBox} nestedScrollEnabled>
          <Text style={styles.prompt} selectable>
            {prompt}
          </Text>
        </ScrollView>
        <Pressable style={styles.secondary} onPress={copy} accessibilityLabel="Copy the prompt">
          <Icon name={copied ? 'check' : 'download'} size={18} color={colors.text} />
          <Text style={styles.secondaryText}>{copied ? 'Copied' : 'Copy prompt'}</Text>
        </Pressable>
      </View>

      <Text style={styles.step}>3. Paste its reply</Text>
      <TextInput
        style={styles.input}
        value={reply}
        onChangeText={(t) => {
          setReply(t);
          setReport(null);
          setError(null);
        }}
        placeholder="Paste the AI's reply here"
        placeholderTextColor={colors.muted}
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Pressable
        style={styles.secondary}
        onPress={async () => setReply(await Clipboard.getString())}
        accessibilityLabel="Paste from clipboard"
      >
        <Text style={styles.secondaryText}>Paste from clipboard</Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable
          style={[styles.secondary, styles.flexBtn, (!reply.trim() || importer.isPending) && styles.off]}
          onPress={() => run(true)}
          disabled={!reply.trim() || importer.isPending}
          accessibilityLabel="Check the links without importing"
        >
          <Text style={styles.secondaryText}>Check</Text>
        </Pressable>
        <Pressable
          style={[styles.primary, styles.flexBtn, (!reply.trim() || importer.isPending) && styles.off]}
          onPress={() => run(false)}
          disabled={!reply.trim() || importer.isPending}
          accessibilityLabel="Import the videos"
        >
          <Text style={styles.primaryText}>Import</Text>
        </Pressable>
      </View>

      {importer.isPending && (
        <View style={styles.card}>
          <LoadingBars />
          <Text style={styles.muted}>Checking each link with YouTube…</Text>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      {report && (
        <View style={styles.card}>
          <Text style={styles.label}>{report.dryRun ? 'Check result: nothing saved yet' : 'Imported'}</Text>
          <Text style={styles.value}>
            {report.accepted} {report.dryRun ? 'ready to import' : 'videos added'}
          </Text>
          {Object.entries(report.byList).map(([key, n]) => {
            const [lang, list] = key.split(':');
            return (
              <Text key={key} style={styles.body}>
                {languageLabel(lang)} · {LIST_LABEL[list] ?? list}: {n}
              </Text>
            );
          })}
          {report.rejected.length > 0 && (
            <>
              <Text style={[styles.label, styles.gapTop]}>Turned away ({report.rejected.length})</Text>
              {report.rejected.slice(0, 30).map((r, i) => (
                <Text key={`${r.url}${i}`} style={styles.rejected} numberOfLines={2}>
                  {r.url} — {r.reason}
                </Text>
              ))}
            </>
          )}
          {report.dryRun && report.accepted > 0 && <Text style={styles.muted}>Press Import to add them.</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  body: { color: colors.text, fontSize: 14 },
  step: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 16, gap: 8 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: colors.text, fontSize: 22, fontWeight: '700' },
  promptBox: { maxHeight: 220 },
  prompt: { color: colors.text, fontSize: 12, lineHeight: 18 },
  input: {
    minHeight: 140,
    maxHeight: 260,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 12,
    fontSize: 13,
  },
  actions: { flexDirection: 'row', gap: 10 },
  flexBtn: { flex: 1 },
  primary: { height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
  secondary: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  off: { opacity: 0.4 },
  error: { color: colors.danger, fontSize: 14 },
  rejected: { color: colors.muted, fontSize: 12 },
  gapTop: { marginTop: 8 },
}));
