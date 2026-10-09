import type { BuilderRunResult } from '../../lib/builder/contracts.ts'
import type { HarnessVerificationResult } from '../core/types.ts'

/** A killed verifier cannot establish a competency failure or a pass. */
export function verifyBuilderResidencyProof(
  proof: BuilderRunResult,
  evidenceRef: string,
): HarnessVerificationResult {
  const verified = proof.exitCode === 0 && !proof.timedOut
  return Object.freeze({
    verified,
    verifierRef: 'host://builder-residency-independent-proof-v1',
    evidenceRefs: Object.freeze([evidenceRef]),
    ...(verified ? {} : {
      reason: proof.timedOut ? 'residency_proof_timed_out' : `residency_proof_exit_${proof.exitCode}`,
      // Exit 137 is SIGKILL/resource exhaustion, not a completed assertion verdict.
      // Preserve the observed code; do not infer OOM or manufacture competency evidence.
      failureAttribution: proof.exitCode === 137 ? 'infrastructure' as const : 'competency' as const,
    }),
  })
}
