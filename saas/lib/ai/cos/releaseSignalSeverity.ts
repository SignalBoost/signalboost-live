// saas/lib/ai/cos/releaseSignalSeverity.ts
//
// NOT EVERY RELEASE SIGNAL IS AN ANSWER DEFECT.
//
// RESTORED 2026-08-26. This module and its wiring were shipped earlier the same day and later
// disappeared from main while unrelated files kept their changes — a parallel edit landed on top
// of cosFirstAnswerEnterprise.ts and reverted the gate. The defect below then returned to
// production. If it goes missing again, look for an overwrite rather than assuming it was never
// merged; the test in tests/releaseSignalSeverity.node.test.ts asserts the wiring, and it is
// listed in scripts/vercel-cos-gates.mjs so a build now fails instead of silently regressing.
//
// The executive release gate collects signals and used to treat all of them as fatal: if any
// survived one repair pass the turn failed closed with no draft at all. That conflated two
// different kinds of finding.
//
//   BLOCKING — the ANSWER is wrong. Unsupported commercial certainty, invented numeric limits,
//     fabricated timelines, legal conclusions, unstated security frameworks. Releasing these
//     misinforms the reader, so failing closed is correct and stays correct.
//
//   ADVISORY — a SUBSYSTEM underperformed, but the answer itself is sound.
//     'relevant_learned_evidence_not_used' means retrieval injected a full-content corpus row and
//     the draft cited no [CL#] label. That is a statement about RETRIEVAL, not about the answer.
//
// Production failures that forced the split: a 512-H100 migration cost question was answered
// correctly and killed by 'relevant_learned_evidence_not_used' alone, twice; the same signal
// killed a PDU-headroom question, a strategy-weights request and a video-script request.
// Retrieval had drawn loosely-related rows from a corpus of hundreds of items and tagged an
// LLM-infrastructure economics question as "networking DNS TLS HTTP API performance". The model
// cited nothing because nothing applied — the honest outcome — and the only way past the gate was
// to invent a citation, which is precisely what the anti-fabrication kernel exists to prevent.
// Minutes later the identical question was ANSWERED, because that retrieval draw happened to
// inject a metadata pointer instead of a full-content row. A gate whose verdict depends on which
// rows retrieval happened to draw is not a quality gate.
//
// The governing principle is already established in this codebase for the semantic cache: an
// internal subsystem's failure must never cost the user the answer. Advisory signals are recorded
// and surfaced in the provenance funnel (N injected -> 0 cited), where they belong, and the
// answer is released.
//
// Pure and dependency-free so the severity rule is unit-testable without the reasoner.

/**
 * Signals that describe a subsystem's behaviour rather than a defect in the answer. These never
 * fail a turn closed on their own.
 */
export const ADVISORY_RELEASE_SIGNALS: readonly string[] = ['relevant_learned_evidence_not_used']

/** True when this signal indicates the answer itself is unsafe to release. */
export function isBlockingReleaseSignal(signal: string): boolean {
  return !ADVISORY_RELEASE_SIGNALS.includes(String(signal ?? '').trim())
}

/** The subset of signals that must fail the turn closed. */
export function blockingReleaseSignals(signals: readonly string[]): string[] {
  return signals.filter(isBlockingReleaseSignal)
}

/** The subset of signals that are recorded but released. */
export function advisoryReleaseSignals(signals: readonly string[]): string[] {
  return signals.filter(signal => !isBlockingReleaseSignal(signal))
}
