import type { SupabaseClient } from '@supabase/supabase-js'
import type { A2ADelegationRisk } from './a2a-agent-registry.ts'
import type { A2ADelegationResult, A2AMeshWriteRecoveryEnvelope } from './a2a-delegation-runtime.ts'
import type { OwnershipIdentity } from '../lib/supervisor/coordination/index.ts'

export const SPECIALIST_MESH_WRITE_RECOVERY_VERSION = 'signalboost-specialist-mesh-write-recovery-v1' as const
export const SPECIALIST_MESH_WRITE_FAILOVER_SAFE_MODE = 'a2a_write_failover_safe' as const
export const SPECIALIST_MESH_WRITE_RECONCILED_APPLIED_MODE = 'a2a_write_reconciled_applied' as const

export type SpecialistMeshWriteRisk = Exclude<A2ADelegationRisk, 'advisory'>
export type SpecialistMeshWriteOutcome = 'applied' | 'not_applied' | 'unknown'

export class SpecialistMeshWriteRecoveryError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'SpecialistMeshWriteRecoveryError'
  }
}

export interface SpecialistMeshWriteScope {
  tenantId: string
  environmentId: string
  portableId: string
  taskId: string
  skillId: string
  workItemId: string
  risk: SpecialistMeshWriteRisk
}

export interface SpecialistMeshWriteOwner extends OwnershipIdentity {
  agentId: string
}

export interface SpecialistMeshWriteProviderRequest extends SpecialistMeshWriteScope {
  operationKey: string
  agentId: string
  transportRef: string
}

export interface SpecialistMeshWriteReconciliation {
  outcome: SpecialistMeshWriteOutcome
  /** Durable provider-side or buyer-controlled evidence reference. Self-asserted prose is insufficient. */
  evidenceRef: string
  providerOperationRef?: string
  /** Optional reconstructed result when the provider proves the side effect already happened. */
  data?: Readonly<Record<string, unknown>>
}

export interface SpecialistMeshWriteRecoveryProvider {
  /** Stable provider/adapter identity. Multiple adapters may never claim the same request. */
  providerId: string
  matches(input: SpecialistMeshWriteProviderRequest): boolean
  /** Must deterministically return the provider idempotency key for this logical operation. No side effect is allowed here. */
  idempotencyKey(input: SpecialistMeshWriteProviderRequest): Promise<string> | string
  /** Independently reconcile the provider using the exact idempotency key after an execution result. */
  reconcile(input: SpecialistMeshWriteProviderRequest & {
    idempotencyKey: string
    result: A2ADelegationResult
  }): Promise<SpecialistMeshWriteReconciliation>
}

export interface SpecialistMeshWriteRecoveryProviderRegistry {
  resolve(input: SpecialistMeshWriteProviderRequest): SpecialistMeshWriteRecoveryProvider | null
}

export interface SpecialistMeshWriteRecoveryRecord extends SpecialistMeshWriteScope {
  attemptKey: string
  operationKey: string
  agentId: string
  fencingToken: number
  providerId: string
  idempotencyKey: string
  status: 'prepared' | SpecialistMeshWriteOutcome
  providerEvidenceRef?: string
  providerOperationRef?: string
  createdAt: string
  reconciledAt?: string
}

export interface SpecialistMeshWriteRecoveryStore {
  prepare(input: SpecialistMeshWriteScope & {
    owner: SpecialistMeshWriteOwner
    operationKey: string
    providerId: string
    idempotencyKey: string
  }): Promise<SpecialistMeshWriteRecoveryRecord>
  record(input: SpecialistMeshWriteScope & {
    owner: SpecialistMeshWriteOwner
    operationKey: string
    providerId: string
    idempotencyKey: string
    outcome: SpecialistMeshWriteOutcome
    evidenceRef: string
    providerOperationRef?: string
  }): Promise<SpecialistMeshWriteRecoveryRecord>
}

function required(value: unknown, name: string, max = 2048): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*' || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new SpecialistMeshWriteRecoveryError('write_recovery_value_invalid', `${name} is invalid`)
  }
  return normalized
}

function positiveFence(value: unknown): number {
  const fence = Number(value)
  if (!Number.isInteger(fence) || fence < 1) {
    throw new SpecialistMeshWriteRecoveryError('write_recovery_owner_invalid', 'fencing token must be positive')
  }
  return fence
}

function validateScope(scope: SpecialistMeshWriteScope): SpecialistMeshWriteScope {
  if (scope.risk !== 'write' && scope.risk !== 'consequential') {
    throw new SpecialistMeshWriteRecoveryError('write_recovery_risk_invalid', 'write recovery requires write or consequential risk')
  }
  return Object.freeze({
    tenantId: required(scope.tenantId, 'tenantId'),
    environmentId: required(scope.environmentId, 'environmentId'),
    portableId: required(scope.portableId, 'portableId'),
    taskId: required(scope.taskId, 'taskId'),
    skillId: required(scope.skillId, 'skillId'),
    workItemId: required(scope.workItemId, 'workItemId'),
    risk: scope.risk,
  })
}

function validateOwner(owner: SpecialistMeshWriteOwner): SpecialistMeshWriteOwner {
  return Object.freeze({
    agentId: required(owner.agentId, 'owner.agentId'),
    leaseId: required(owner.leaseId, 'owner.leaseId'),
    ownerInstanceId: required(owner.ownerInstanceId, 'owner.ownerInstanceId'),
    ownerRuntimeId: required(owner.ownerRuntimeId, 'owner.ownerRuntimeId'),
    fencingToken: positiveFence(owner.fencingToken),
  })
}

export function specialistMeshWriteOperationKey(scope: Pick<SpecialistMeshWriteScope, 'tenantId' | 'environmentId' | 'portableId' | 'taskId' | 'skillId'>): string {
  return [scope.tenantId, scope.environmentId, scope.portableId, scope.taskId, scope.skillId]
    .map((value, index) => encodeURIComponent(required(value, `operationScope[${index}]`)))
    .join('|')
}

export function specialistMeshWriteAttemptKey(input: { operationKey: string; providerId: string; fencingToken: number }): string {
  return [
    encodeURIComponent(required(input.operationKey, 'operationKey')),
    encodeURIComponent(required(input.providerId, 'providerId', 256)),
    String(positiveFence(input.fencingToken)),
  ].join('|')
}

export function normalizeSpecialistMeshIdempotencyKey(value: unknown): string {
  return required(value, 'idempotencyKey', 512)
}

export function normalizeSpecialistMeshWriteReconciliation(value: SpecialistMeshWriteReconciliation): SpecialistMeshWriteReconciliation {
  if (!value || !['applied', 'not_applied', 'unknown'].includes(value.outcome)) {
    throw new SpecialistMeshWriteRecoveryError('write_reconciliation_invalid', 'provider reconciliation outcome is invalid')
  }
  const evidenceRef = required(value.evidenceRef, 'evidenceRef')
  return Object.freeze({
    outcome: value.outcome,
    evidenceRef,
    ...(value.providerOperationRef ? { providerOperationRef: required(value.providerOperationRef, 'providerOperationRef') } : {}),
    ...(value.data ? { data: Object.freeze({ ...value.data }) } : {}),
  })
}

export function createSpecialistMeshWriteRecoveryProviderRegistry(
  providers: readonly SpecialistMeshWriteRecoveryProvider[],
): SpecialistMeshWriteRecoveryProviderRegistry {
  const normalized = providers.map(provider => Object.freeze({ ...provider, providerId: required(provider.providerId, 'providerId', 256) }))
  if (new Set(normalized.map(provider => provider.providerId)).size !== normalized.length) {
    throw new SpecialistMeshWriteRecoveryError('write_recovery_provider_duplicate', 'provider ids must be unique')
  }
  return Object.freeze({
    resolve(input) {
      const matches = normalized.filter(provider => provider.matches(input))
      if (matches.length > 1) {
        throw new SpecialistMeshWriteRecoveryError('write_recovery_provider_ambiguous', 'multiple provider adapters matched one write attempt')
      }
      return matches[0] ?? null
    },
  })
}

export function specialistMeshWriteRecoveryEnvelope(input: {
  operationKey: string
  providerId: string
  idempotencyKey: string
}): A2AMeshWriteRecoveryEnvelope {
  return Object.freeze({
    schemaVersion: SPECIALIST_MESH_WRITE_RECOVERY_VERSION,
    operationKey: required(input.operationKey, 'operationKey'),
    providerId: required(input.providerId, 'providerId', 256),
    idempotencyKey: normalizeSpecialistMeshIdempotencyKey(input.idempotencyKey),
  })
}

function recordFromRow(row: any): SpecialistMeshWriteRecoveryRecord {
  if (!row || typeof row !== 'object') {
    throw new SpecialistMeshWriteRecoveryError('write_recovery_record_invalid', 'write recovery row is invalid')
  }
  const status = String(row.status ?? '')
  if (!['prepared', 'applied', 'not_applied', 'unknown'].includes(status)) {
    throw new SpecialistMeshWriteRecoveryError('write_recovery_record_invalid', 'write recovery row status is invalid')
  }
  const risk = String(row.risk ?? '')
  if (risk !== 'write' && risk !== 'consequential') {
    throw new SpecialistMeshWriteRecoveryError('write_recovery_record_invalid', 'write recovery row risk is invalid')
  }
  const createdAt = new Date(required(row.created_at ?? row.createdAt, 'createdAt')).toISOString()
  const reconciledRaw = row.reconciled_at ?? row.reconciledAt
  return Object.freeze({
    attemptKey: required(row.attempt_key ?? row.attemptKey, 'attemptKey'),
    operationKey: required(row.operation_key ?? row.operationKey, 'operationKey'),
    workItemId: required(row.work_item_id ?? row.workItemId, 'workItemId'),
    tenantId: required(row.tenant_id ?? row.tenantId, 'tenantId'),
    environmentId: required(row.environment_id ?? row.environmentId, 'environmentId'),
    portableId: required(row.portable_id ?? row.portableId, 'portableId'),
    taskId: required(row.task_id ?? row.taskId, 'taskId'),
    skillId: required(row.skill_id ?? row.skillId, 'skillId'),
    risk,
    agentId: required(row.agent_id ?? row.agentId, 'agentId'),
    fencingToken: positiveFence(row.fencing_token ?? row.fencingToken),
    providerId: required(row.provider_id ?? row.providerId, 'providerId', 256),
    idempotencyKey: normalizeSpecialistMeshIdempotencyKey(row.idempotency_key ?? row.idempotencyKey),
    status: status as SpecialistMeshWriteRecoveryRecord['status'],
    ...(row.provider_evidence_ref ?? row.providerEvidenceRef ? { providerEvidenceRef: required(row.provider_evidence_ref ?? row.providerEvidenceRef, 'providerEvidenceRef') } : {}),
    ...(row.provider_operation_ref ?? row.providerOperationRef ? { providerOperationRef: required(row.provider_operation_ref ?? row.providerOperationRef, 'providerOperationRef') } : {}),
    createdAt,
    ...(reconciledRaw ? { reconciledAt: new Date(required(reconciledRaw, 'reconciledAt')).toISOString() } : {}),
  })
}

export function createInMemorySpecialistMeshWriteRecoveryStore(options: { now?: () => Date } = {}): SpecialistMeshWriteRecoveryStore {
  const rows = new Map<string, SpecialistMeshWriteRecoveryRecord>()
  const now = options.now ?? (() => new Date())
  return Object.freeze({
    async prepare(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const operationKey = required(input.operationKey, 'operationKey')
      const providerId = required(input.providerId, 'providerId', 256)
      const idempotencyKey = normalizeSpecialistMeshIdempotencyKey(input.idempotencyKey)
      const attemptKey = specialistMeshWriteAttemptKey({ operationKey, providerId, fencingToken: owner.fencingToken })
      const existing = rows.get(attemptKey)
      if (existing) {
        if (existing.idempotencyKey !== idempotencyKey || existing.agentId !== owner.agentId) {
          throw new SpecialistMeshWriteRecoveryError('write_recovery_prepare_conflict', 'prepared attempt does not match the current owner/idempotency key')
        }
        return existing
      }
      const record = recordFromRow({
        ...scope,
        attempt_key: attemptKey,
        operation_key: operationKey,
        agent_id: owner.agentId,
        fencing_token: owner.fencingToken,
        provider_id: providerId,
        idempotency_key: idempotencyKey,
        status: 'prepared',
        created_at: now().toISOString(),
      })
      rows.set(attemptKey, record)
      return record
    },
    async record(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const operationKey = required(input.operationKey, 'operationKey')
      const providerId = required(input.providerId, 'providerId', 256)
      const idempotencyKey = normalizeSpecialistMeshIdempotencyKey(input.idempotencyKey)
      const evidenceRef = required(input.evidenceRef, 'evidenceRef')
      if (!['applied', 'not_applied', 'unknown'].includes(input.outcome)) {
        throw new SpecialistMeshWriteRecoveryError('write_reconciliation_invalid', 'write recovery outcome is invalid')
      }
      const attemptKey = specialistMeshWriteAttemptKey({ operationKey, providerId, fencingToken: owner.fencingToken })
      const existing = rows.get(attemptKey)
      if (!existing || existing.status !== 'prepared' || existing.idempotencyKey !== idempotencyKey || existing.agentId !== owner.agentId) {
        throw new SpecialistMeshWriteRecoveryError('write_recovery_record_conflict', 'write recovery record requires the matching prepared attempt')
      }
      const reconciled = recordFromRow({
        ...existing,
        attempt_key: attemptKey,
        operation_key: operationKey,
        provider_id: providerId,
        idempotency_key: idempotencyKey,
        status: input.outcome,
        provider_evidence_ref: evidenceRef,
        provider_operation_ref: input.providerOperationRef,
        reconciled_at: now().toISOString(),
      })
      rows.set(attemptKey, reconciled)
      return reconciled
    },
  })
}

/** Service-role adapter. RPCs atomically lock and validate the exact Supervisor fence. */
export function createSupabaseSpecialistMeshWriteRecoveryStore(db: SupabaseClient): SpecialistMeshWriteRecoveryStore {
  return Object.freeze({
    async prepare(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const operationKey = required(input.operationKey, 'operationKey')
      const providerId = required(input.providerId, 'providerId', 256)
      const idempotencyKey = normalizeSpecialistMeshIdempotencyKey(input.idempotencyKey)
      const { data, error } = await db.rpc('a2a_specialist_mesh_write_recovery_prepare', {
        p_attempt_key: specialistMeshWriteAttemptKey({ operationKey, providerId, fencingToken: owner.fencingToken }),
        p_operation_key: operationKey,
        p_work_item_id: scope.workItemId,
        p_tenant_id: scope.tenantId,
        p_environment_id: scope.environmentId,
        p_portable_id: scope.portableId,
        p_task_id: scope.taskId,
        p_skill_id: scope.skillId,
        p_risk: scope.risk,
        p_agent_id: owner.agentId,
        p_lease_id: owner.leaseId,
        p_owner_instance_id: owner.ownerInstanceId,
        p_owner_runtime_id: owner.ownerRuntimeId,
        p_fencing_token: owner.fencingToken,
        p_provider_id: providerId,
        p_idempotency_key: idempotencyKey,
      })
      if (error) throw new SpecialistMeshWriteRecoveryError('write_recovery_store_unavailable', error.message)
      return recordFromRow(data)
    },
    async record(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const operationKey = required(input.operationKey, 'operationKey')
      const providerId = required(input.providerId, 'providerId', 256)
      const idempotencyKey = normalizeSpecialistMeshIdempotencyKey(input.idempotencyKey)
      const evidenceRef = required(input.evidenceRef, 'evidenceRef')
      const { data, error } = await db.rpc('a2a_specialist_mesh_write_recovery_record', {
        p_attempt_key: specialistMeshWriteAttemptKey({ operationKey, providerId, fencingToken: owner.fencingToken }),
        p_work_item_id: scope.workItemId,
        p_lease_id: owner.leaseId,
        p_owner_instance_id: owner.ownerInstanceId,
        p_owner_runtime_id: owner.ownerRuntimeId,
        p_fencing_token: owner.fencingToken,
        p_idempotency_key: idempotencyKey,
        p_outcome: input.outcome,
        p_evidence_ref: evidenceRef,
        p_provider_operation_ref: input.providerOperationRef ?? null,
      })
      if (error) throw new SpecialistMeshWriteRecoveryError('write_recovery_store_unavailable', error.message)
      return recordFromRow(data)
    },
  })
}
