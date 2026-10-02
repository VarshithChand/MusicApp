import { LabelScore } from "./rules";

/**
 * Pure rules for how predictions become approved labels. Predictions are suggestions; only an admin's approval
 * (or edit) creates a label that search can use, and a new prediction can never overwrite an approved label.
 */

/** Which predicted labels a bulk "approve suggestions" accepts. */
export function selectLabelsToApprove(predicted: LabelScore[], minConfidence = 0.5): LabelScore[] {
  return predicted.filter((l) => l.confidence >= minConfidence);
}

/** After re-running classification: the approved labels stay exactly as they were; only the predictions change. */
export function afterReclassify(approvedSlugs: string[], newPredictions: LabelScore[]): { approved: string[]; predictions: LabelScore[]; newSuggestions: string[] } {
  return {
    approved: [...approvedSlugs],
    predictions: newPredictions,
    newSuggestions: newPredictions.map((p) => p.slug).filter((s) => !approvedSlugs.includes(s)),
  };
}

/** When an admin edits labels by hand, their list is the whole truth — the model's guesses do not get added back. */
export function applyAdminEdit(_predicted: LabelScore[], adminSlugs: string[]): string[] {
  return [...new Set(adminSlugs)];
}

/** Review status of a song's classification. */
export type ReviewStatus = "pending" | "needs_review" | "approved" | "rejected";
