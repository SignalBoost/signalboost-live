// saas/platform-harness/verification/outcome-verifier.ts
//
// The Harness supplies evidence to a verifier; it does not grade itself.
// Evaluation-runtime may use this same port, but hidden exam cases/rubrics remain
// outside the teaching/Residency path.

import type {
  HarnessManifest,
  HarnessObservableEvent,
  HarnessVerificationResult,
} from '../core/types.ts'
import type { HarnessActionResult } from '../runtime/governed-executor.ts'

export interface HarnessOutcomeVerificationInput {
  manifest: HarnessManifest
  trajectory: readonly HarnessObservableEvent[]
  actionResults: readonly HarnessActionResult[]
}

export interface HarnessOutcomeVerifierPort {
  verify(input: HarnessOutcomeVerificationInput): Promise<HarnessVerificationResult>
}

export function normalizeHarnessVerification(
  result: HarnessVerificationResult,
): HarnessVerificationResult {
  const verifierRef = String(result.verifierRef ?? '').trim()
  if (!verifierRef) {
    return Object.freeze({
      verified: false,
      verifierRef: 'verifier://invalid',
      evidenceRefs: Object.freeze([]),
      reason: 'harness_verifier_ref_missing',
      failureAttribution: 'harness',
    })
  }
  return Object.freeze({
    verified: result.verified === true,
    verifierRef,
    evidenceRefs: Object.freeze([...new Set(result.evidenceRefs ?? [])]),
    ...(result.reason ? { reason: String(result.reason).slice(0, 1000) } : {}),
    ...(result.failureAttribution
      ? { failureAttribution: result.failureAttribution }
      : {}),
  })
}
