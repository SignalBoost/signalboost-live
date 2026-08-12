import type { CosDelegationResult } from './connectorDelegation.ts'

export interface CosEvidenceSufficiency {
  sufficient: boolean
  successful: number
  attempted: number
  failedCapabilities: readonly string[]
}

/** Deterministic gate: avoid spending a reasoning cycle on an evidence packet that is clearly unusable. */
export function assessDelegatedEvidence(result: CosDelegationResult): CosEvidenceSufficiency {
  const failedCapabilities = result.evidence.filter(item => !item.result.ok).map(item => item.capabilityId)
  const successful = result.evidence.length - failedCapabilities.length
  const attempted = result.evidence.length
  return Object.freeze({
    sufficient: result.ok && result.missingRequired.length === 0 && successful > 0,
    successful,
    attempted,
    failedCapabilities: Object.freeze(failedCapabilities),
  })
}
