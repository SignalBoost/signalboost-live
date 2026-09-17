// saas/lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts
// Owner direction (2026-09-17): mass-distilled artifacts must reach independent evaluation without a hand-inserted
// canary approval each. On 2026-09-17 all 30 evaluation_pending mass artifacts had no canary, so the automatic
// evaluator (which requires a passed canary) had nothing it could run. This pure policy decides, once per cron tick,
// whether to issue ONE canary approval in exactly the shape claim_next_mass_distilled_runtime_canary accepts
// (1 invocation, <= $0.20). It never touches the claim, the canary, the evaluator, promotion or Production traffic.

export const MASS_CANARY_ROLLING_AUTHORIZATION_REF = 'owner_explicit_direction_2026-09-17_mass_canary_without_manual_intervention' as const
export const MASS_CANARY_PROFILE = 'cos_local_distilled_runtime_deploy_v1' as const
export const MASS_CANARY_APPROVAL_CLAIM = 'local_distilled_runtime_deploy_approved' as const
export const MASS_CANARY_ROLLING_WINDOW_HOURS = 24
export const MASS_CANARY_ROLLING_MAX_APPROVALS = 24
export const MASS_CANARY_MAX_FAILED_ATTEMPTS_PER_ARTIFACT = 3
export const MASS_CANARY_MAX_COST_USD = 0.2
export const MASS_CANARY_APPROVAL_TTL_MS = 2 * 60 * 60 * 1000

export type CanaryArtifact = Readonly<{ candidateId: string; subjectId: string; artifactHash: string; createdAt: string }>
export type CanaryEvent = Readonly<{ candidateId: string; observedAt: string; expiresAt: string | null; verifier: string; evidence: Record<string, unknown> | null }>
export type CanaryDecision =
  | Readonly<{ issue: true; artifact: CanaryArtifact; evidence: Record<string, unknown>; expiresAt: string }>
  | Readonly<{ issue: false; reason: string }>

const HEX64 = /^[a-f0-9]{64}$/i
const at = (value: string | null | undefined) => Date.parse(String(value || ''))

function forArtifact(events: readonly CanaryEvent[], artifact: CanaryArtifact): CanaryEvent[] {
  return events.filter(event => event.candidateId === artifact.candidateId
    && event.evidence?.profile === MASS_CANARY_PROFILE
    && String(event.evidence?.artifactHash || '').toLowerCase() === artifact.artifactHash.toLowerCase())
}

function claim(event: CanaryEvent): string { return String(event.evidence?.claim || '') }

/** An approval is still armed while unexpired, not yet invoked, and under the claim's three preflight failures. */
function armedApproval(own: readonly CanaryEvent[], nowMs: number): boolean {
  return own.some(approval => {
    if (approval.verifier !== 'host_controller' || claim(approval) !== MASS_CANARY_APPROVAL_CLAIM) return false
    const approvedAt = at(approval.observedAt)
    if (!Number.isFinite(approvedAt) || !(at(approval.expiresAt) > nowMs)) return false
    const after = own.filter(event => at(event.observedAt) >= approvedAt)
    if (after.some(event => claim(event) === 'local_distilled_runtime_canary_invocation_started')) return false
    return after.filter(event => claim(event) === 'local_distilled_runtime_canary_preflight_failed').length < 3
  })
}

export function decideMassCanaryRollingApproval(input: {
  artifacts: readonly CanaryArtifact[]
  events: readonly CanaryEvent[]
  now: Date
  enabled: boolean
}): CanaryDecision {
  if (!input.enabled) return { issue: false, reason: 'mass_canary_rolling_authorization_disabled' }
  const nowMs = input.now.getTime()

  const issuedInWindow = input.events.filter(event => event.verifier === 'host_controller'
    && claim(event) === MASS_CANARY_APPROVAL_CLAIM
    && event.evidence?.authorizationRef === MASS_CANARY_ROLLING_AUTHORIZATION_REF
    && at(event.observedAt) > nowMs - MASS_CANARY_ROLLING_WINDOW_HOURS * 3600_000).length
  if (issuedInWindow >= MASS_CANARY_ROLLING_MAX_APPROVALS) return { issue: false, reason: 'mass_canary_rolling_window_exhausted' }

  const valid = input.artifacts
    .filter(artifact => artifact.candidateId.startsWith('mass:') && HEX64.test(artifact.artifactHash) && artifact.subjectId)
    .sort((a, b) => at(a.createdAt) - at(b.createdAt) || a.candidateId.localeCompare(b.candidateId))

  // The claim serves one reservation at a time; issuing a second approval while one is armed only queues spend.
  if (valid.some(artifact => armedApproval(forArtifact(input.events, artifact), nowMs))) {
    return { issue: false, reason: 'mass_canary_approval_already_armed' }
  }

  for (const artifact of valid) {
    const own = forArtifact(input.events, artifact).sort((a, b) => at(a.observedAt) - at(b.observedAt))
    if (own.some(event => claim(event) === 'local_distilled_runtime_canary_passed')) continue
    const latestControl = [...own].reverse().find(event => event.verifier === 'host_controller'
      && [MASS_CANARY_APPROVAL_CLAIM, 'local_distilled_runtime_canary_suspended'].includes(claim(event)))
    if (latestControl && claim(latestControl) === 'local_distilled_runtime_canary_suspended') continue
    const firstRolling = own.find(event => claim(event) === MASS_CANARY_APPROVAL_CLAIM
      && event.evidence?.authorizationRef === MASS_CANARY_ROLLING_AUTHORIZATION_REF)
    const failures = firstRolling
      ? own.filter(event => at(event.observedAt) >= at(firstRolling.observedAt)
        && claim(event) === 'local_distilled_runtime_canary_failed').length
      : 0
    if (failures >= MASS_CANARY_MAX_FAILED_ATTEMPTS_PER_ARTIFACT) continue

    return {
      issue: true,
      artifact,
      expiresAt: new Date(nowMs + MASS_CANARY_APPROVAL_TTL_MS).toISOString(),
      evidence: {
        profile: MASS_CANARY_PROFILE,
        claim: MASS_CANARY_APPROVAL_CLAIM,
        candidateId: artifact.candidateId,
        artifactHash: artifact.artifactHash.toLowerCase(),
        canaryAuthorized: true,
        maxCanaryInvocations: 1,
        maxEstimatedCanaryCostUsd: MASS_CANARY_MAX_COST_USD,
        productionTrafficAuthorized: false,
        automaticPromotionAuthorized: false,
        authorityExpanded: false,
        authorizationRef: MASS_CANARY_ROLLING_AUTHORIZATION_REF,
      },
    }
  }
  return { issue: false, reason: 'no_mass_artifact_eligible_for_rolling_canary' }
}
