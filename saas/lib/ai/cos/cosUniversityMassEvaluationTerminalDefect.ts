// saas/lib/ai/cos/cosUniversityMassEvaluationTerminalDefect.ts
//
// Some evaluation failures can never succeed on a later attempt, because the thing they failed on is frozen.
// A holdout is pinned to an exact immutable commit, so if its reference is malformed, its rows do not match
// the pinned manifest hash, its parquet is absent at that commit, or the commit no longer resolves at all,
// then every retry re-reads the same bytes and fails the same way. Those artifacts were nevertheless left in
// `evaluation_pending`, re-armed on the cooldown ladder, and each attempt spent a RunPod wake to rediscover a
// verdict that could not change.
//
// Only one such error was recognised (`..._holdout_format_invalid`). This names the rest, so a permanently
// unevaluable artifact is quarantined with its reason recorded instead of circling.
//
// Deliberately NOT here, because a retry genuinely can succeed:
//  - hf_token_missing and any 5xx/429 from the registry: configuration or availability, not the artifact;
//  - hf_tree_http_ statuses other than 404, for the same reason;
//  - the parquet file/row/size ceilings: those are limits in our reader, and raising a ceiling is a code fix
//    that should not first have quarantined the artifacts it would have admitted.

const TERMINAL_HOLDOUT_DEFECTS = Object.freeze([
  // The pinned reference itself is unusable.
  'mass_distilled_evaluation_holdout_ref_invalid',
  'mass_distilled_evaluation_holdout_revision_invalid',
  'distilled_evaluation_hf_repo_invalid',
  'distilled_evaluation_hf_path_invalid',
  // The pinned commit resolves but holds nothing this evaluation can score.
  'mass_distilled_evaluation_holdout_format_invalid',
  'mass_distilled_evaluation_holdout_count_invalid',
  'distilled_evaluation_hf_pinned_parquet_missing',
  'distilled_evaluation_hf_pinned_parquet_contract_invalid',
  'distilled_evaluation_hf_pinned_parquet_row_invalid',
  'distilled_evaluation_hf_tree_invalid',
  // The pinned content is not the content the artifact was trained and recorded against.
  'mass_distilled_evaluation_holdout_manifest_mismatch',
  'mass_distilled_evaluation_holdout_integrity_failed',
])

// The commit is gone. Any other tree status is availability, and stays retryable.
const TERMINAL_HOLDOUT_STATUS_DEFECT = 'distilled_evaluation_hf_tree_http_404'

/**
 * True when this failure is a property of the artifact's frozen holdout rather than of the attempt.
 *
 * Prefix matching, not equality: the evaluator appends structural fingerprints and case ids to several of
 * these names, and an exact comparison would stop recognising the very failures this exists to catch.
 */
export function isTerminalHoldoutDataDefect(message: unknown): boolean {
  const text = String(message ?? '').trim()
  if (!text) return false
  if (text.startsWith(TERMINAL_HOLDOUT_STATUS_DEFECT)) return true
  return TERMINAL_HOLDOUT_DEFECTS.some(defect => text.startsWith(defect))
}

export const TERMINAL_HOLDOUT_DATA_DEFECTS = TERMINAL_HOLDOUT_DEFECTS
