import { LABEL_SLUGS } from "../labels";
import { SongInfo, suggestMoods } from "../moodRules";
import { AudioFeatures } from "./features";

/**
 * Turns measured audio features (and weaker hints from the title/movie) into suggested labels with confidence scores.
 *
 * IMPORTANT: this is a transparent set of hand-written heuristics, NOT a trained machine-learning model.
 * Tempo, loudness and beat strength say a lot about energy/style (Melody vs DJ vs Mass) but little about emotional
 * mood, so mood labels from audio alone are capped at a low confidence and flagged for review. Nothing here is
 * ever published automatically: an admin approves every label.
 */

export const MODEL_VERSION = "heuristic-v1";
export const MIN_CONFIDENCE = 0.35; // labels below this are not suggested at all
export const REVIEW_BELOW = 0.55; // if even the best label is below this, the song needs manual review

export interface LabelScore {
  slug: string;
  confidence: number;
  evidence: string[];
}

export interface ClassificationOutput {
  labels: LabelScore[];
  needsReview: boolean;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 100) / 100;
/** Independent pieces of evidence combine like probabilities: 1 - (1-a)(1-b). */
const combine = (a: number, b: number) => 1 - (1 - a) * (1 - b);

/** 0 (quiet, sparse, dark) … 1 (loud, busy, bright). */
export function energyScore(f: AudioFeatures): number {
  const loudness = clamp((f.rmsDb + 34) / 22);
  const busyness = clamp(f.onsetDensity / 5);
  const brightness = clamp(f.brightness / 0.35);
  // Heavy compression ("loudness war" mastering) suggests an energetic production — but only if there is real sound.
  const compression = f.rmsDb > -60 ? clamp((14 - f.crestDb) / 8) : 0;
  return round(0.4 * loudness + 0.3 * busyness + 0.15 * brightness + 0.15 * compression);
}

function fromAudio(f: AudioFeatures): Map<string, LabelScore> {
  const out = new Map<string, LabelScore>();
  const add = (slug: string, confidence: number, why: string) => {
    if (confidence <= 0) return;
    const existing = out.get(slug);
    if (existing) {
      existing.confidence = combine(existing.confidence, confidence);
      existing.evidence.push(why);
    } else out.set(slug, { slug, confidence, evidence: [why] });
  };

  const e = energyScore(f);
  const bpm = f.tempoBpm;
  const steady = f.beatStrength;
  const detail = `tempo ${bpm || "?"} BPM, energy ${e}, beat strength ${steady}`;

  // Style / energy — the strongest thing audio can tell us. Capped at 0.8.
  if (e >= 0.65 && bpm >= 100 && f.onsetDensity >= 2.5) add("mass", clamp(0.5 + 0.9 * (e - 0.65), 0, 0.8), `loud and busy (${detail})`);
  if (e >= 0.6) add("energetic", clamp(0.45 + 0.9 * (e - 0.6), 0, 0.8), `high energy (${detail})`);
  if (steady >= 0.55 && bpm >= 118 && bpm <= 145 && e >= 0.55) add("dj-remix", clamp(0.35 + 0.5 * (steady - 0.55) + 0.4 * (e - 0.55), 0, 0.7), `very steady club tempo (${detail})`);
  if (bpm >= 100 && bpm <= 135 && steady >= 0.4 && e >= 0.45) add("dance", clamp(0.4 + 0.5 * (steady - 0.4), 0, 0.7), `danceable pulse (${detail})`);
  if (e <= 0.5 && f.onsetDensity <= 3.2 && f.brightness <= 0.3 && steady <= 0.55) add("melody", clamp(0.45 + 0.6 * (0.5 - e), 0, 0.75), `calm, sparse and smooth (${detail})`);

  // Mood from audio alone is weak evidence, so it stays below the review line.
  if (bpm > 0 && bpm <= 90 && e <= 0.35) add("sad", 0.38, `slow and quiet (${detail}) — only a weak sign of sadness`);
  if (e <= 0.3 && f.brightness <= 0.25) add("relaxing", 0.45, `very quiet and soft (${detail})`);
  if (e >= 0.7 && bpm >= 115) add("workout", 0.36, `fast and powerful (${detail})`);
  if (e >= 0.6 && bpm >= 110) add("party", 0.36, `loud and fast (${detail})`);

  return out;
}

/** Hints from the title/movie/genre keywords: real but weak evidence (0.5, a little more for the first match). */
function fromMetadata(meta: SongInfo): Map<string, LabelScore> {
  const out = new Map<string, LabelScore>();
  for (const m of suggestMoods(meta)) {
    if (!LABEL_SLUGS.has(m.slug)) continue;
    out.set(m.slug, { slug: m.slug, confidence: m.primary ? 0.55 : 0.5, evidence: [`the title, movie or genre contains a "${m.slug}" word`] });
  }
  return out;
}

const STYLE_LABELS = new Set(["melody", "dj-remix", "mass", "energetic", "dance"]);
const HIGH_ENERGY_STYLES = new Set(["dj-remix", "mass", "energetic", "dance"]);

export function classifyFeatures(features: AudioFeatures | null, meta: SongInfo): ClassificationOutput {
  const merged = new Map<string, LabelScore>();
  const mergeIn = (m: Map<string, LabelScore>) => {
    for (const [slug, score] of m) {
      const existing = merged.get(slug);
      if (existing) {
        existing.confidence = combine(existing.confidence, score.confidence);
        existing.evidence.push(...score.evidence);
      } else merged.set(slug, { ...score, evidence: [...score.evidence] });
    }
  };
  // Near-silent audio (below about -50 dBFS) says nothing reliable about style, so it is ignored and the song is flagged.
  const audible = !!features && features.rmsDb > -50;
  const audio = features && audible ? fromAudio(features) : null;
  if (audio) mergeIn(audio);

  const hints = fromMetadata(meta);
  if (features && audio) {
    // The audio has the final say on STYLE labels. A title that says "Melody" cannot make a loud drum track a melody,
    // and a title that says "Mass" cannot make a quiet pad a mass song. Mood and genre words can't be checked against
    // the audio, so those hints are kept as they are.
    const energy = energyScore(features);
    for (const [slug, hint] of hints) {
      if (!STYLE_LABELS.has(slug)) continue;
      const supported = audio.has(slug);
      const contradicted = (slug === "melody" && energy >= 0.55) || (HIGH_ENERGY_STYLES.has(slug) && energy <= 0.35);
      if (contradicted) hint.confidence = 0.2;
      else if (!supported) hint.confidence = Math.min(hint.confidence, 0.4);
    }
  }
  mergeIn(hints);

  const labels = [...merged.values()]
    .map((l) => ({ ...l, confidence: round(clamp(l.confidence, 0, 0.95)) }))
    .filter((l) => l.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);

  // Low confidence → do not trust it; the admin has to look at this song.
  const needsReview = !audible || labels.length === 0 || labels[0].confidence < REVIEW_BELOW;
  return { labels, needsReview };
}
