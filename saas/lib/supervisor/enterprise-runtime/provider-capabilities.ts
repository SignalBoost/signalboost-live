import type { SerializableValue } from '../incident-schema.ts'

export interface SnapshotContext {
  snapshotId: string
  providerType: string
  targetResourceUrn: string
  codeState: { commitSha?: string; imageDigest?: string }
  schemaState: { migrationVersion?: string; configHash?: string }
  capturedAt: string
}

export interface ExecutionVerification {
  healthy: boolean
  metrics: Record<string, number>
  assertionFailures: string[]
}

export interface ProviderPlanner {
  validatePlan(targetResourceUrn: string, params: Record<string, SerializableValue>): Promise<{ allowed: boolean; reason: string }>
}

export interface SnapshotProvider {
  checkpoint(targetResourceUrn: string): Promise<SnapshotContext>
}

export interface MutationProvider {
  execute(targetResourceUrn: string, params: Record<string, SerializableValue>): Promise<{ success: boolean; evidence?: Record<string, SerializableValue> }>
}

export interface VerificationProvider {
  verify(targetResourceUrn: string): Promise<ExecutionVerification>
}

export interface RollbackProvider {
  rollback(snapshot: SnapshotContext): Promise<{ restored: boolean; evidence?: Record<string, SerializableValue> }>
}

export interface AuditEvidenceProvider {
  auditEvidence(snapshotId: string): Promise<Record<string, SerializableValue>>
}

export interface EnterpriseProviderDescriptor {
  providerType: string
  planner?: ProviderPlanner
  snapshots?: SnapshotProvider
  mutations?: MutationProvider
  verification?: VerificationProvider
  rollback?: RollbackProvider
  audit?: AuditEvidenceProvider
}

export function assertDryRunCapable(provider: EnterpriseProviderDescriptor): asserts provider is EnterpriseProviderDescriptor & {
  planner: ProviderPlanner
  snapshots: SnapshotProvider
  mutations: MutationProvider
  verification: VerificationProvider
  rollback: RollbackProvider
} {
  if (!provider.planner || !provider.snapshots || !provider.mutations || !provider.verification || !provider.rollback) {
    throw new Error(`Provider ${provider.providerType} does not implement the complete dry-run capability set`)
  }
}
