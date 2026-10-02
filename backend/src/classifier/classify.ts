import { LABEL_SLUGS } from "../labels";
import { SongInfo } from "../moodRules";
import { decodeToMono, ANALYSIS_RATE } from "./decode";
import { AudioFeatures, extractFeatures } from "./features";
import { classifyFeatures, LabelScore, MODEL_VERSION, REVIEW_BELOW } from "./rules";

/**
 * Classifies one song. Order of attempts (each failure falls through to the next, none of them throws):
 *  1. An external model service, if CLASSIFIER_URL is set (see docs/CLASSIFICATION.md for the contract).
 *  2. Local audio analysis (ffmpeg + the heuristics in rules.ts).
 *  3. Title / movie / genre hints only — always needs manual review.
 */

export type ClassificationMethod = "external" | "audio-features" | "metadata";

export interface ClassificationResult {
  labels: LabelScore[];
  features: AudioFeatures | null;
  method: ClassificationMethod;
  modelVersion: string;
  needsReview: boolean;
  /** Why a better method was skipped (shown to the admin), or null. */
  error: string | null;
}

interface ExternalReply {
  model?: string;
  version?: string;
  labels?: { slug?: string; confidence?: number }[];
}

async function classifyExternally(audioUrl: string, meta: SongInfo): Promise<{ labels: LabelScore[]; model: string }> {
  const base = process.env.CLASSIFIER_URL!.replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${base}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.CLASSIFIER_API_KEY ? { "X-API-Key": process.env.CLASSIFIER_API_KEY } : {}) },
      body: JSON.stringify({ audioUrl, title: meta.title, movie: meta.movie, language: meta.language, singers: meta.singers }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`classifier service answered ${res.status}`);
    const body = (await res.json()) as ExternalReply;
    const labels: LabelScore[] = [];
    for (const l of body.labels ?? []) {
      // Never trust a remote reply blindly: unknown labels and out-of-range scores are dropped.
      if (typeof l.slug === "string" && LABEL_SLUGS.has(l.slug) && typeof l.confidence === "number" && l.confidence >= 0 && l.confidence <= 1) {
        labels.push({ slug: l.slug, confidence: Math.round(l.confidence * 100) / 100, evidence: [`predicted by the ${body.model ?? "external"} model`] });
      }
    }
    if (!labels.length) throw new Error("classifier service returned no usable labels");
    return { labels: labels.sort((a, b) => b.confidence - a.confidence).slice(0, 6), model: `${body.model ?? "external"}@${body.version ?? "?"}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function classifySong(source: string, meta: SongInfo & { durationSeconds?: number }, publicUrl?: string): Promise<ClassificationResult> {
  let error: string | null = null;

  if (process.env.CLASSIFIER_URL && publicUrl) {
    try {
      const { labels, model } = await classifyExternally(publicUrl, meta);
      return { labels, features: null, method: "external", modelVersion: model, needsReview: labels[0].confidence < REVIEW_BELOW, error: null };
    } catch (err) {
      error = `External classifier unavailable (${err instanceof Error ? err.message : "error"}); used local analysis instead.`;
    }
  }

  try {
    // Skip a long intro on full-length songs.
    const start = (meta.durationSeconds ?? 0) > 150 ? 30 : 0;
    const samples = await decodeToMono(source, 75, start);
    const features = extractFeatures(samples, ANALYSIS_RATE);
    const out = classifyFeatures(features, meta);
    return { labels: out.labels, features, method: "audio-features", modelVersion: MODEL_VERSION, needsReview: out.needsReview, error };
  } catch (err) {
    const out = classifyFeatures(null, meta);
    const why = `Audio analysis failed (${err instanceof Error ? err.message : "error"}); used the title and movie only.`;
    return { labels: out.labels, features: null, method: "metadata", modelVersion: "keywords-v1", needsReview: true, error: error ? `${error} ${why}` : why };
  }
}
