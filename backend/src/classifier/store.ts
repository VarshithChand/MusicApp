import { query } from "../db";
import { ClassificationResult } from "./classify";
import { MODEL_VERSION } from "./rules";
import { selectLabelsToApprove } from "./review";

/** Database access for classification predictions and approvals. */

/** The same audio classified by the same local model before: reuse it instead of analysing again. */
export async function findCached(sha256: string): Promise<ClassificationResult | null> {
  const [row] = await query(
    `SELECT labels, features, method, model_version FROM song_classifications
     WHERE audio_sha256 = $1 AND model_version = $2 AND error IS NULL ORDER BY updated_at DESC LIMIT 1`,
    [sha256, MODEL_VERSION],
  );
  if (!row) return null;
  const top = row.labels?.[0]?.confidence ?? 0;
  return { labels: row.labels, features: row.features, method: row.method, modelVersion: row.model_version, needsReview: top < 0.55, error: null };
}

/** Saves (or replaces) the PREDICTIONS for a song. Approved labels live in song_moods and are never touched here. */
export async function savePrediction(songId: number, result: ClassificationResult, sha256: string | null) {
  // A song an admin already approved stays approved; a new prediction just appears as new suggestions to look at.
  await query(
    `INSERT INTO song_classifications (song_id, labels, features, method, model_version, review_status, audio_sha256, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (song_id) DO UPDATE SET
       labels = EXCLUDED.labels, features = EXCLUDED.features, method = EXCLUDED.method, model_version = EXCLUDED.model_version,
       audio_sha256 = EXCLUDED.audio_sha256, error = EXCLUDED.error, updated_at = now(),
       review_status = CASE WHEN song_classifications.review_status = 'approved' THEN 'approved' ELSE EXCLUDED.review_status END`,
    [songId, JSON.stringify(result.labels), result.features ? JSON.stringify(result.features) : null, result.method, result.modelVersion, result.needsReview ? "needs_review" : "pending", sha256, result.error],
  );
}

/**
 * Makes predicted labels real: copies them into song_moods as approved (source = 'manual'). Labels the song already has
 * are kept as they are. Returns how many labels were added.
 */
export async function approvePredictedLabels(songId: number, opts: { minConfidence?: number; only?: string[] } = {}): Promise<number> {
  const [row] = await query("SELECT labels FROM song_classifications WHERE song_id = $1", [songId]);
  if (!row) return 0;
  let labels = selectLabelsToApprove(row.labels ?? [], opts.minConfidence ?? 0.5);
  if (opts.only) labels = labels.filter((l) => opts.only!.includes(l.slug));

  const [{ n }] = await query<{ n: number }>("SELECT COUNT(*)::int AS n FROM song_moods WHERE song_id = $1 AND source = 'manual' AND is_primary", [songId]);
  let hasPrimary = n > 0;
  let added = 0;
  for (const l of labels) {
    const res = await query(
      `INSERT INTO song_moods (song_id, mood_id, is_primary, source, confidence)
       SELECT $1, id, $3, 'manual', $4 FROM moods WHERE slug = $2
       ON CONFLICT (song_id, mood_id) DO UPDATE SET source = 'manual', confidence = COALESCE(song_moods.confidence, EXCLUDED.confidence)
       RETURNING 1`,
      [songId, l.slug, !hasPrimary, l.confidence],
    );
    if (res.length) {
      added++;
      hasPrimary = true;
    }
  }
  await query("UPDATE song_classifications SET review_status = 'approved', updated_at = now() WHERE song_id = $1", [songId]);
  return added;
}

export async function rejectPrediction(songId: number) {
  await query("UPDATE song_classifications SET review_status = 'rejected', updated_at = now() WHERE song_id = $1", [songId]);
}
