export const COS_AUTONOMY_SCHEMA_VERSION = 'cos-autonomy-v1' as const

export type CosAutonomyStopReason =
  | 'goal_satisfied'
  | 'approval_required'
  | 'blocked'
  | 'kill_switch'
  | 'max_cycles'
  | 'max_failures'
  | 'no_progress'
  | 'adapter_failure'

export interface PortableCapabilityDescriptor {
  capabilityId: string
  version: string
  description: string
  readOnly: boolean
  reversible: boolean
  requiresApproval: boolean
  riskClass: 'read_only' | 'low_risk_reversible' | 'medium' | 'high' | 'forbidden'
  inputSchema?: Record<string, unknown>
  evidenceTypes: readonly string[]
  verificationTypes: readonly string[]
}

export interface PortableManifest {
  schemaVersion: typeof COS_AUTONOMY_SCHEMA_VERSION
  portableId: string
  portableVersion: string
  capabilities: readonly PortableCapabilityDescriptor[]
}

export interface PortableObservation {
  observedAt: string
  summary: string
  facts: Record<string, unknown>
  evidenceIds: readonly string[]
  stateFingerprint: string
}

export interface CosProposedAction {
  actionId: string
  capabilityId: string
  justification: string
  params: Record<string, unknown>
}

export interface CosAutonomyPlan {
  planId: string
  objective: string
  actions: readonly CosProposedAction[]
  expectedOutcome: string
  confidence: number
}

export interface PortableActionResult {
  actionId: string
  status: 'completed' | 'failed' | 'blocked' | 'approval_required'
  summary: string
  evidenceIds?: readonly string[]
}

export interface PortableVerificationResult {
  status: 'verified' | 'failed' | 'inconclusive'
  goalSatisfied: boolean
  summary: string
  evidenceIds?: readonly string[]
}

export interface PortableRecoveryResult {
  status: 'restored' | 'recovered' | 'failed' | 'not_available'
  summary: string
}

/**
 * The ONLY contract COS needs from a portable. No product names, no product-specific
 * imports, and no assumptions about whether execution happens through API, browser,
 * hardware, cloud, or another runtime.
 */
export interface UniversalPortableRuntime {
  getManifest(): Promise<PortableManifest> | PortableManifest
  observe(input: { objective: string }): Promise<PortableObservation>
  invoke(input: { objective: string; action: CosProposedAction }): Promise<PortableActionResult>
  verify(input: { objective: string; observation: PortableObservation; plan: CosAutonomyPlan; results: readonly PortableActionResult[] }): Promise<PortableVerificationResult>
  recover?(input: { objective: string; observation: PortableObservation; plan: CosAutonomyPlan; results: readonly PortableActionResult[]; verification: PortableVerificationResult }): Promise<PortableRecoveryResult>
}

/** COS's brain is also injected. The autonomy kernel does not depend on one LLM. */
export interface CosAutonomyBrain {
  plan(input: {
    objective: string
    manifest: PortableManifest
    observation: PortableObservation
    cycle: number
    previousCycles: readonly CosAutonomyCycleRecord[]
  }): Promise<CosAutonomyPlan>
}

export interface CosAutonomyGuard {
  isKillSwitchEngaged(): Promise<boolean> | boolean
  authorize(input: {
    manifest: PortableManifest
    action: CosProposedAction
  }): Promise<{ outcome: 'approved' | 'approval_required' | 'blocked'; reason: string }> | { outcome: 'approved' | 'approval_required' | 'blocked'; reason: string }
}

export interface CosAutonomyPolicy {
  maxCycles: number
  maxConsecutiveFailures: number
  maxRepeatedState: number
  minimumPlanConfidence: number
  requireEvidence: boolean
}

export interface CosAutonomyCycleRecord {
  cycle: number
  observation: PortableObservation
  plan?: CosAutonomyPlan
  results?: readonly PortableActionResult[]
  verification?: PortableVerificationResult
  recovery?: PortableRecoveryResult
  startedAt: string
  finishedAt: string
}

export interface CosAutonomyRunResult {
  runId: string
  portableId: string
  objective: string
  status: 'completed' | 'stopped'
  stopReason: CosAutonomyStopReason
  summary: string
  cycles: readonly CosAutonomyCycleRecord[]
}
