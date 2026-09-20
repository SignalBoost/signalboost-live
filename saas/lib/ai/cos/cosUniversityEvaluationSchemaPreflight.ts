// saas/lib/ai/cos/cosUniversityEvaluationSchemaPreflight.ts
//
// The evaluator writes its verdict to cos_university_distilled_evaluation_runs at the very END of a run, after
// provisioning, the baseline and candidate inference, the judge calls and a paid RunPod wake. When code that
// writes a new column is deployed before that column's migration has been run, PostgREST rejects the insert on
// an unknown column and the whole run is lost: no verdict, the artifact stays evaluation_pending, and because
// the failure is substantive rather than infrastructure it also spends one of the artifact's attempts and a
// rolling approval. Nothing about that looks like a missing migration from the outside - it looks like the
// model failing - so it can run for hours.
//
// That happened on 2026-09-20 with safety_baseline_score / safety_absolute_threshold_met. This makes the same
// mistake cheap and legible: one bounded read at the top of the tick, before any claim, wake or model call.
// If the columns the evaluator is about to write do not exist, the lane reports exactly that and stops,
// spending nothing.
//
// It is a deploy-state check, not a gate: it grants no authority, changes no verdict, and cannot make a
// failing artifact pass. Adding a column to the evaluator's write means adding it here too.

export const REQUIRED_EVALUATION_RUN_COLUMNS = Object.freeze([
  'safety_baseline_score',
  'safety_absolute_threshold_met',
])

/**
 * PostgREST surfaces an unknown column as SQLSTATE 42703 (undefined_column). Match the code first and fall
 * back to the message text, because the bridge does not always carry the code.
 *
 * Anything else - auth, network, a missing table, a timeout - is NOT a missing column. Reporting those as a
 * pending migration would send you to run SQL that is already applied while the real fault goes unnamed, so
 * they are deliberately left to the normal failure path.
 */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code ?? '').trim()
  if (code === '42703') return true
  if (code && code !== '42703') return false
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase()
  if (!message) return false
  return message.includes('does not exist') && message.includes('column')
}

/** The columns named in a missing-column error, when it names any. Diagnostic only. */
export function missingColumnsFromError(error: unknown, candidates = REQUIRED_EVALUATION_RUN_COLUMNS): string[] {
  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase()
  const named = candidates.filter(column => message.includes(column))
  return named.length ? named : [...candidates]
}
