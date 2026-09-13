import type { SupabaseClient } from '@supabase/supabase-js'
import type { OwnershipIdentity } from '../lib/supervisor/coordination/index.ts'

export const SPECIALIST_MESH_CHECKPOINT_VERSION = 'signalboost-specialist-mesh-checkpoint-v1' as const
export const SPECIALIST_MESH_CHECKPOINT_SIGNAL_KEY = 'signalboostMeshCheckpoint' as const
export const SPECIALIST_MESH_HANDOFF_SIGNAL_KEY = 'signalboostMeshHandoff' as const
export const SPECIALIST_MESH_CHECKPOINT_MAX_BYTES = 65_536
export const SPECIALIST_MESH_CHECKPOINT_DEFAULT_TTL_MS = 15 * 60_000
export const SPECIALIST_MESH_CHECKPOINT_MAX_TTL_MS = 60 * 60_000

const unsafeKey = /(secret|token|cookie|password|authorization|api[_-]?key|credential)/i

export class SpecialistMeshCheckpointError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'SpecialistMeshCheckpointError'
  }
}

export interface SpecialistMeshCheckpointScope {
  tenantId: string
  environmentId: string
  portableId: string
  taskId: string
  skillId: string
  workItemId: string
}

export interface SpecialistMeshCheckpointOwner extends OwnershipIdentity {
  agentId: string
}

export interface SpecialistMeshCheckpointRecord extends SpecialistMeshCheckpointScope {
  checkpointKey: string
  sourceAgentId: string
  sourceFencingToken: number
  state: Readonly<Record<string, unknown>>
  createdAt: string
  expiresAt: string
}

export interface SpecialistMeshCheckpointStore {
  load(input: SpecialistMeshCheckpointScope & { owner: SpecialistMeshCheckpointOwner }): Promise<SpecialistMeshCheckpointRecord | null>
  save(input: SpecialistMeshCheckpointScope & {
    owner: SpecialistMeshCheckpointOwner
    state: Readonly<Record<string, unknown>>
    ttlMs?: number
  }): Promise<SpecialistMeshCheckpointRecord>
  clear(input: SpecialistMeshCheckpointScope & { owner: SpecialistMeshCheckpointOwner }): Promise<void>
}

export interface SpecialistMeshCheckpointSignal {
  state: Readonly<Record<string, unknown>>
  ttlMs?: number
  handoff: boolean
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*') throw new SpecialistMeshCheckpointError('checkpoint_scope_invalid', `${name} is required`)
  return normalized
}

function containsUnsafeKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsUnsafeKey)
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (unsafeKey.test(key) || containsUnsafeKey(child)) return true
  }
  return false
}

export function normalizeSpecialistMeshCheckpointState(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SpecialistMeshCheckpointError('checkpoint_state_invalid', 'checkpoint state must be an object')
  }
  if (containsUnsafeKey(value)) {
    throw new SpecialistMeshCheckpointError('checkpoint_state_unsafe', 'checkpoint state may not contain credential-like keys')
  }
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new SpecialistMeshCheckpointError('checkpoint_state_invalid', 'checkpoint state must be JSON serializable')
  }
  if (!serialized || new TextEncoder().encode(serialized).byteLength > SPECIALIST_MESH_CHECKPOINT_MAX_BYTES) {
    throw new SpecialistMeshCheckpointError('checkpoint_state_too_large', `checkpoint state exceeds ${SPECIALIST_MESH_CHECKPOINT_MAX_BYTES} bytes`)
  }
  return Object.freeze(JSON.parse(serialized) as Record<string, unknown>)
}

function normalizedTtl(value: unknown): number {
  const ttl = value === undefined ? SPECIALIST_MESH_CHECKPOINT_DEFAULT_TTL_MS : Number(value)
  if (!Number.isFinite(ttl) || ttl < 1_000 || ttl > SPECIALIST_MESH_CHECKPOINT_MAX_TTL_MS) {
    throw new SpecialistMeshCheckpointError('checkpoint_ttl_invalid', 'checkpoint TTL is outside the allowed window')
  }
  return Math.floor(ttl)
}

export function specialistMeshCheckpointKey(scope: Pick<SpecialistMeshCheckpointScope, 'tenantId' | 'environmentId' | 'portableId' | 'taskId' | 'skillId'>): string {
  return [scope.tenantId, scope.environmentId, scope.portableId, scope.taskId, scope.skillId]
    .map((value, index) => encodeURIComponent(required(value, `scope[${index}]`)))
    .join('|')
}

export function readSpecialistMeshCheckpointSignal(data: Readonly<Record<string, unknown>> | undefined): SpecialistMeshCheckpointSignal | null {
  if (!data) return null
  const raw = data[SPECIALIST_MESH_CHECKPOINT_SIGNAL_KEY]
  const handoff = data[SPECIALIST_MESH_HANDOFF_SIGNAL_KEY] === true
  if (raw === undefined) {
    if (handoff) throw new SpecialistMeshCheckpointError('checkpoint_signal_invalid', 'checkpoint handoff requires checkpoint state')
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SpecialistMeshCheckpointError('checkpoint_signal_invalid', 'checkpoint signal must be an object')
  }
  const signal = raw as Record<string, unknown>
  if (String(signal.version ?? '') !== '1') {
    throw new SpecialistMeshCheckpointError('checkpoint_signal_invalid', 'checkpoint signal version must be 1')
  }
  return Object.freeze({
    state: normalizeSpecialistMeshCheckpointState(signal.state),
    ...(signal.ttlMs === undefined ? {} : { ttlMs: normalizedTtl(signal.ttlMs) }),
    handoff,
  })
}

function validateScope(scope: SpecialistMeshCheckpointScope): SpecialistMeshCheckpointScope {
  return Object.freeze({
    tenantId: required(scope.tenantId, 'tenantId'),
    environmentId: required(scope.environmentId, 'environmentId'),
    portableId: required(scope.portableId, 'portableId'),
    taskId: required(scope.taskId, 'taskId'),
    skillId: required(scope.skillId, 'skillId'),
    workItemId: required(scope.workItemId, 'workItemId'),
  })
}

function validateOwner(owner: SpecialistMeshCheckpointOwner): SpecialistMeshCheckpointOwner {
  const fencingToken = Number(owner.fencingToken)
  if (!Number.isInteger(fencingToken) || fencingToken < 1) throw new SpecialistMeshCheckpointError('checkpoint_owner_invalid', 'fencing token must be positive')
  return Object.freeze({
    agentId: required(owner.agentId, 'agentId'),
    leaseId: required(owner.leaseId, 'leaseId'),
    ownerInstanceId: required(owner.ownerInstanceId, 'ownerInstanceId'),
    ownerRuntimeId: required(owner.ownerRuntimeId, 'ownerRuntimeId'),
    fencingToken,
  })
}

function recordFromRow(row: any): SpecialistMeshCheckpointRecord {
  if (!row || typeof row !== 'object') throw new SpecialistMeshCheckpointError('checkpoint_record_invalid', 'checkpoint row is invalid')
  return Object.freeze({
    checkpointKey: required(row.checkpoint_key ?? row.checkpointKey, 'checkpointKey'),
    tenantId: required(row.tenant_id ?? row.tenantId, 'tenantId'),
    environmentId: required(row.environment_id ?? row.environmentId, 'environmentId'),
    portableId: required(row.portable_id ?? row.portableId, 'portableId'),
    taskId: required(row.task_id ?? row.taskId, 'taskId'),
    skillId: required(row.skill_id ?? row.skillId, 'skillId'),
    workItemId: required(row.work_item_id ?? row.workItemId, 'workItemId'),
    sourceAgentId: required(row.agent_id ?? row.sourceAgentId, 'sourceAgentId'),
    sourceFencingToken: Number(row.fencing_token ?? row.sourceFencingToken),
    state: normalizeSpecialistMeshCheckpointState(row.checkpoint_state ?? row.state),
    createdAt: new Date(required(row.created_at ?? row.createdAt, 'createdAt')).toISOString(),
    expiresAt: new Date(required(row.expires_at ?? row.expiresAt, 'expiresAt')).toISOString(),
  })
}

export function createInMemorySpecialistMeshCheckpointStore(options: { now?: () => Date } = {}): SpecialistMeshCheckpointStore {
  const rows = new Map<string, SpecialistMeshCheckpointRecord>()
  const now = options.now ?? (() => new Date())
  return Object.freeze({
    async load(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const key = specialistMeshCheckpointKey(scope)
      const row = rows.get(key)
      if (!row) return null
      if (Date.parse(row.expiresAt) <= now().getTime()) {
        rows.delete(key)
        return null
      }
      if (row.sourceFencingToken >= owner.fencingToken) return null
      return recordFromRow(row)
    },
    async save(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const state = normalizeSpecialistMeshCheckpointState(input.state)
      const key = specialistMeshCheckpointKey(scope)
      const existing = rows.get(key)
      if (existing && existing.sourceFencingToken > owner.fencingToken) {
        throw new SpecialistMeshCheckpointError('stale_checkpoint_rejected', 'newer checkpoint fencing token already exists')
      }
      const createdAt = now()
      const record = Object.freeze({
        ...scope,
        checkpointKey: key,
        sourceAgentId: owner.agentId,
        sourceFencingToken: owner.fencingToken,
        state,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + normalizedTtl(input.ttlMs)).toISOString(),
      })
      rows.set(key, record)
      return recordFromRow(record)
    },
    async clear(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const key = specialistMeshCheckpointKey(scope)
      const existing = rows.get(key)
      if (existing && existing.sourceFencingToken > owner.fencingToken) {
        throw new SpecialistMeshCheckpointError('stale_checkpoint_rejected', 'newer checkpoint fencing token already exists')
      }
      rows.delete(key)
    },
  })
}

/** Service-role adapter. Each RPC validates the current Supervisor fence atomically with checkpoint access. */
export function createSupabaseSpecialistMeshCheckpointStore(db: SupabaseClient): SpecialistMeshCheckpointStore {
  return Object.freeze({
    async load(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const { data, error } = await db.rpc('a2a_specialist_mesh_checkpoint_load', {
        p_checkpoint_key: specialistMeshCheckpointKey(scope),
        p_work_item_id: scope.workItemId,
        p_lease_id: owner.leaseId,
        p_owner_instance_id: owner.ownerInstanceId,
        p_owner_runtime_id: owner.ownerRuntimeId,
        p_fencing_token: owner.fencingToken,
      })
      if (error) throw new SpecialistMeshCheckpointError('checkpoint_store_unavailable', error.message)
      return data ? recordFromRow(data) : null
    },
    async save(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const state = normalizeSpecialistMeshCheckpointState(input.state)
      const expiresAt = new Date(Date.now() + normalizedTtl(input.ttlMs)).toISOString()
      const { data, error } = await db.rpc('a2a_specialist_mesh_checkpoint_save', {
        p_checkpoint_key: specialistMeshCheckpointKey(scope),
        p_work_item_id: scope.workItemId,
        p_tenant_id: scope.tenantId,
        p_environment_id: scope.environmentId,
        p_portable_id: scope.portableId,
        p_task_id: scope.taskId,
        p_skill_id: scope.skillId,
        p_agent_id: owner.agentId,
        p_lease_id: owner.leaseId,
        p_owner_instance_id: owner.ownerInstanceId,
        p_owner_runtime_id: owner.ownerRuntimeId,
        p_fencing_token: owner.fencingToken,
        p_checkpoint_state: state,
        p_expires_at: expiresAt,
      })
      if (error) {
        const code = /stale_owner_rejected|stale_checkpoint_rejected/.test(error.message) ? 'stale_checkpoint_rejected' : 'checkpoint_store_unavailable'
        throw new SpecialistMeshCheckpointError(code, error.message)
      }
      return recordFromRow(data)
    },
    async clear(input) {
      const scope = validateScope(input)
      const owner = validateOwner(input.owner)
      const { error } = await db.rpc('a2a_specialist_mesh_checkpoint_clear', {
        p_checkpoint_key: specialistMeshCheckpointKey(scope),
        p_work_item_id: scope.workItemId,
        p_lease_id: owner.leaseId,
        p_owner_instance_id: owner.ownerInstanceId,
        p_owner_runtime_id: owner.ownerRuntimeId,
        p_fencing_token: owner.fencingToken,
      })
      if (error) throw new SpecialistMeshCheckpointError('checkpoint_store_unavailable', error.message)
    },
  })
}
