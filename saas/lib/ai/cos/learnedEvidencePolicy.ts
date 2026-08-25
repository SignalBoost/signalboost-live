// saas/lib/ai/cos/learnedEvidencePolicy.ts
//
// When must a COS answer demonstrably USE retrieved full-content learned-corpus evidence?
//
// Production failure (2026-08-25): the executive release gate required a [CL#] citation whenever
// retrieval had selected any full-content learned row. A simple email edit retrieved
// loosely-related corpus rows, the edited email — correctly — contained no citation tags, one
// repair pass could not honestly add any, and the turn failed closed:
// "Executive answer release rejected: unsupported claim signals
// (relevant_learned_evidence_not_used) remained after local repair." The same rejection killed
// script-writing requests. The owner's product intent is the opposite: edits, scripts, drafts and
// other artifacts composed from the user's own material must never be forced to cite corpus rows.
//
// Rule: evidence-use is required only for KNOWLEDGE answers. Artifact composition — editing,
// rewriting, summarizing, translating, or writing content to the user's instructions, as
// recognized by the shared content-generation classifier — is exempt. The gate's other signals
// (unsupported commercial certainty, invented numbers, legal conclusions) are untouched.

import { isContentGenerationRequest } from './contentGenerationIntent.ts'

/** Marker used by retrieval when a learned-corpus row was injected with its full content. */
const FULL_CONTENT_MARKER = 'retrieved content'

/**
 * True when the release gate should require material use (a [CL#] citation) of retrieved
 * full-content learned evidence for this prompt.
 */
export function learnedEvidenceUseRequired(prompt: string, learnedContextItems: readonly string[]): boolean {
  if (!learnedContextItems.some(item => String(item ?? '').includes(FULL_CONTENT_MARKER))) return false
  return !isContentGenerationRequest(String(prompt ?? ''))
}
