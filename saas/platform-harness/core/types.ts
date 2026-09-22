// Canonical iTMounts Platform Harness contracts. Authority remains outside the harness.
export const HARNESS_PROFILES = ['residency','production','sandbox','self_healing','security_lab','replay','evaluation_runtime'] as const
export type HarnessProfile = typeof HARNESS_PROFILES[number]

export type HarnessOutcomeStatus = 'success'|'agent_failure'|'infrastructure_failure'|'authority_halt'|'harness_failure'

export interface HarnessIdentity {
  agentId: string
  role: string
  artifactHash?: string
}

export interface HarnessLimits {
  maxCostUsd?: number
  maxToolCalls?: number
  deadlineMs?: number
}

export interface HarnessManifest {
  profile: HarnessProfile
  authorityManifestRef: string
  environmentId: string
  production: boolean
  capabilities: readonly string[]
  limits: HarnessLimits
}

export interface HarnessRunRequest {
  runId: string
  objective: string
  identity: HarnessIdentity
  manifest: HarnessManifest
}

export interface HarnessObservableEvent {
  at: string
  kind: 'observation'|'tool_call'|'tool_result'|'verification'|'failure'|'rollback'|'escalation'
  ref: string
  evidenceHash?: string
  costUsd?: number
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
