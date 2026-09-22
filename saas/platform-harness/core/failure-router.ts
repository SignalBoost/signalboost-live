// saas/platform-harness/core/failure-router.ts
//
// Ownership routing is intentionally strict. Infrastructure failure is not model
// incompetence, and competency failure is not infrastructure repair authority.

import type { HarnessOutcomeStatus, HarnessVerificationResult } from './types.ts'

export type HarnessFailureDestination =
  | 'durable_evidence'
  | 'self_healing'
  | 'university_remediation'
  | 'referee_guardian'
  | 'harness_assurance'

export interface HarnessFailureSignals {
  authorityBoundaryReached?: boolean
  infrastructureFailure?: boolean
  agentCompetencyFailure?: boolean
  executionCompleted?: boolean
  verification?: HarnessVerificationResult
}

export function routeHarnessOutcome(status: HarnessOutcomeStatus): HarnessFailureDestination {
  switch (status) {
    case 'success': return 'durable_evidence'
    case 'infrastructure_failure': return 'self_healing'
    case 'agent_failure': return 'university_remediation'
    case 'authority_halt': return 'referee_guardian'
    case 'verification_failure':
    case 'harness_failure':
      return 'harness_assurance'
  }
}

export function classifyHarnessResult(signals: HarnessFailureSignals): {
  status: HarnessOutcomeStatus
  destination: HarnessFailureDestination
  reason: string
} {
  if (signals.authorityBoundaryReached) {
    return Object.freeze({
      status: 'authority_halt',
      destination: 'referee_guardian',
      reason: 'authority_or_approval_boundary_reached',
    })
  }
  if (signals.infrastructureFailure) {
    return Object.freeze({
      status: 'infrastructure_failure',
      destination: 'self_healing',
      reason: 'environment_provider_or_tool_infrastructure_failed',
    })
  }
  if (signals.agentCompetencyFailure) {
    return Object.freeze({
      status: 'agent_failure',
      destination: 'university_remediation',
      reason: 'observable_agent_competency_failed_with_infrastructure_available',
    })
  }
  if (signals.verification?.verified) {
    return Object.freeze({
      status: 'success',
      destination: 'durable_evidence',
      reason: 'independent_outcome_verification_passed',
    })
  }
  if (signals.executionCompleted && signals.verification && !signals.verification.verified) {
    return Object.freeze({
      status: 'verification_failure',
      destination: 'harness_assurance',
      reason: 'execution_completed_but_required_state_not_verified',
    })
  }
  return Object.freeze({
    status: 'harness_failure',
    destination: 'harness_assurance',
    reason: 'insufficient_evidence_for_safe_failure_attribution',
  })
}
