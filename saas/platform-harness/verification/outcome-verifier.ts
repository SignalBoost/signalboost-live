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

export interface HarnessTrajectoryVerifier {
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
  const evidenceRefs = Object.freeze([...new Set(result.evidenceRefs ?? [])].filter(Boolean))
  if (result.verified === true && evidenceRefs.length === 0) {
    return Object.freeze({
      verified: false,
      verifierRef,
      evidenceRefs,
      reason: 'harness_verifier_evidence_required',
      failureAttribution: 'harness' as const,
    })
  }
  return Object.freeze({
    verified: result.verified === true,
    verifierRef,
    evidenceRefs,
    ...(result.reason ? { reason: String(result.reason).slice(0, 1000) } : {}),
    ...(result.failureAttribution
      ? { failureAttribution: result.failureAttribution }
      : {}),
  })
}
