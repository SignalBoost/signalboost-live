// saas/platform-harness/core/types.ts
//
// Canonical iTMounts Platform Harness contracts.
// Authority remains outside the harness: profiles constrain trusted authority;
// they can never create, widen, or substitute it.

export const HARNESS_PROFILES = [
  'residency',
  'production',
  'sandbox',
  'self_healing',
  'security_lab',
  'replay',
  'evaluation_runtime',
] as const

export type HarnessProfile = (typeof HARNESS_PROFILES)[number]

export const HARNESS_ENVIRONMENT_CLASSES = [
  'synthetic',
  'sandbox',
  'staging',
  'security_lab',
  'production',
] as const

export type HarnessEnvironmentClass = (typeof HARNESS_ENVIRONMENT_CLASSES)[number]

export interface HarnessIdentity {
  agentId: string
  role: string
  tenantId?: string
  /** Provider Hub assignment subject; defaults to agentId when omitted. */
  portableId?: string
  artifact?: {
    artifactId: string
    artifactHash?: string
    revision?: string
  }
}

export interface HarnessEnvironment {
  environmentId: string
  class: HarnessEnvironmentClass
  fixtureHash?: string
}

export interface HarnessLimits {
  maxCostUsd?: number
  maxToolCalls?: number
  deadlineMs?: number
  maxConcurrency?: number
}

export type HarnessCapabilityRisk = 'read' | 'write' | 'consequential'

export interface HarnessCapabilityGrant {
  id: string
  environments: readonly HarnessEnvironmentClass[]
  mutating: boolean
  /** Consequential authority must be explicit; mutating alone defaults to write. */
  risk?: HarnessCapabilityRisk
  scopes?: readonly string[]
  preferredProviders?: readonly string[]
}

/**
 * Authority input already verified by Referee/Guardian/host.
 * The harness consumes this envelope but does not verify signatures itself.
 */
export interface HarnessAuthorityEnvelope {
  manifestRef: string
  verified: boolean
  verifiedBy: 'referee' | 'guardian' | 'host'
  environments: readonly HarnessEnvironmentClass[]
  capabilities: readonly HarnessCapabilityGrant[]
  limits?: HarnessLimits
}

export interface HarnessRunRequest {
  runId: string
  objective: string
  identity: HarnessIdentity
  profile: HarnessProfile
  environment: HarnessEnvironment
  requestedCapabilities: readonly string[]
  requestedLimits?: HarnessLimits
}

export interface HarnessManifest {
  runId: string
  objective: string
  identity: HarnessIdentity
  profile: HarnessProfile
  environment: HarnessEnvironment
  capabilities: readonly HarnessCapabilityGrant[]
  authorityManifestRef: string
  limits: HarnessLimits
  learningFeedbackAllowed: boolean
}

export interface HarnessObservableEvent {
  runId: string
  sequence: number
  at: string
  kind:
    | 'run_started'
    | 'manifest_bound'
    | 'capability_resolved'
    | 'tool_call'
    | 'tool_result'
    | 'observation'
    | 'verification'
    | 'failure'
    | 'rollback'
    | 'escalation'
    | 'run_finished'
  summary: string
  evidenceRefs?: readonly string[]
  data?: Readonly<Record<string, unknown>>
}

export type HarnessOutcomeStatus =
  | 'success'
  | 'agent_failure'
  | 'infrastructure_failure'
  | 'authority_halt'
  | 'verification_failure'
  | 'harness_failure'

export interface HarnessVerificationResult {
  verified: boolean
  verifierRef: string
  evidenceRefs: readonly string[]
  reason?: string
  /** Independent verifier attribution; the worker under examination does not own this decision. */
  failureAttribution?: 'infrastructure' | 'competency' | 'authority' | 'harness'
}

export interface HarnessOutcome {
  status: HarnessOutcomeStatus
  verifierRef?: string
  evidenceHash?: string
  failureCode?: string
}

export interface HarnessRunResult {
  runId: string
  profile: HarnessProfile
  trajectory: readonly HarnessObservableEvent[]
  outcome: HarnessOutcome
  authorityExpanded: false
  productionMutationObserved: boolean
}
