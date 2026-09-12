import { OwnershipError, ownershipIdentity, type CoordinationStore, type Lease, type OwnershipIdentity, type SupervisorInstance, type WorkItem, type WorkItemState } from '../lib/supervisor/coordination/index.ts'

export const SPECIALIST_MESH_COORDINATION_VERSION = 'signalboost-specialist-mesh-coordination-v3' as const
export const SPECIALIST_MESH_PROVIDER = 'a2a-specialist-mesh' as const

export interface SpecialistMeshWorker {
  agentId: string
  instanceId: string
  runtimeId: string
}

export interface SpecialistMeshTaskInput {
  taskId: string
  tenantId: string
  environment: WorkItem['environment']
  priority?: number
  maxAttempts?: number
  policyVersion: string
}

function required(value: unknown, name: string): string {
  const text = String(value ?? '').trim()
  if (!text || text === '*') throw new Error(`specialist mesh ${name} is required`)
  return text
}

function workItemId(taskId: string): string {
  return `specialist-mesh:${required(taskId, 'taskId')}`
}

export function specialistMeshWorkItem(input: SpecialistMeshTaskInput, now = new Date()): WorkItem {
  const taskId = required(input.taskId, 'taskId')
  const tenantId = required(input.tenantId, 'tenantId')
  const policyVersion = required(input.policyVersion, 'policyVersion')
  const timestamp = now.toISOString()
  return Object.freeze({
    workItemId: workItemId(taskId),
    workItemType: 'specialist_advisory_task',
    incidentId: workItemId(taskId),
    provider: SPECIALIST_MESH_PROVIDER,
    tenantId,
    environment: input.environment,
    state: 'queued',
    priority: input.priority ?? 50,
    createdAt: timestamp,
    availableAt: timestamp,
    attempt: 0,
    maxAttempts: input.maxAttempts ?? 3,
    policyVersion,
    capabilityVersion: SPECIALIST_MESH_COORDINATION_VERSION,
    schemaVersion: 'specialist-mesh-work-item-v1',
  })
}

export async function ensureSpecialistMeshTask(store: CoordinationStore, input: SpecialistMeshTaskInput, now = new Date()): Promise<WorkItem> {
  const desired = specialistMeshWorkItem(input, now)
  const existing = await store.getWorkItem(desired.workItemId)
  if (existing) return existing
  try {
    return await store.enqueueWorkItem(desired)
  } catch (error) {
    const raced = await store.getWorkItem(desired.workItemId)
    if (raced) return raced
    throw error
  }
}

export async function registerSpecialistMeshWorker(store: CoordinationStore, worker: SpecialistMeshWorker, input: { softwareVersion: string; region?: string; availabilityZone?: string; now?: Date }): Promise<SupervisorInstance> {
  const at = input.now ?? new Date()
  return store.registerInstance({
    instanceId: required(worker.instanceId, 'worker.instanceId'),
    runtimeId: required(worker.runtimeId, 'worker.runtimeId'),
    region: input.region,
    availabilityZone: input.availabilityZone,
    startedAt: at.toISOString(),
    heartbeatAt: at.toISOString(),
    softwareVersion: required(input.softwareVersion, 'softwareVersion'),
    schemaVersion: 'specialist-mesh-worker-v1',
    supportedProviderKinds: [SPECIALIST_MESH_PROVIDER],
    status: 'healthy',
  })
}

export async function claimSpecialistMeshTask(store: CoordinationStore, input: {
  taskId: string
  worker: SpecialistMeshWorker
  eligibleAgentIds: readonly string[]
  leaseDurationMs?: number
  now?: Date
}): Promise<Lease> {
  const agentId = required(input.worker.agentId, 'worker.agentId')
  if (!input.eligibleAgentIds.includes(agentId)) throw new OwnershipError('mesh_worker_not_eligible', 'specialist is not eligible for this task')
  return store.acquireLease({
    workItemId: workItemId(input.taskId),
    ownerInstanceId: required(input.worker.instanceId, 'worker.instanceId'),
    ownerRuntimeId: required(input.worker.runtimeId, 'worker.runtimeId'),
    leaseDurationMs: input.leaseDurationMs ?? 60_000,
    now: input.now,
  })
}

export async function assertSpecialistMeshOwnership(store: CoordinationStore, taskId: string, lease: Lease, now?: Date): Promise<OwnershipIdentity> {
  const owner = ownershipIdentity(lease)
  await store.assertFence(workItemId(taskId), owner, now)
  return owner
}

async function transitionSpecialistMeshTask(store: CoordinationStore, input: {
  taskId: string
  lease: Lease
  from: WorkItemState
  to: WorkItemState
  executionId?: string
  now?: Date
}): Promise<WorkItem> {
  const owner = await assertSpecialistMeshOwnership(store, input.taskId, input.lease, input.now)
  return store.transitionWorkItem({
    workItemId: workItemId(input.taskId),
    from: input.from,
    to: input.to,
    owner,
    executionId: input.executionId,
    now: input.now,
  })
}

export function startSpecialistMeshTask(store: CoordinationStore, taskId: string, lease: Lease, executionId?: string, now?: Date): Promise<WorkItem> {
  return transitionSpecialistMeshTask(store, { taskId, lease, from: 'leased', to: 'processing', executionId, now })
}

export function verifySpecialistMeshTask(store: CoordinationStore, taskId: string, lease: Lease, executionId?: string, now?: Date): Promise<WorkItem> {
  return transitionSpecialistMeshTask(store, { taskId, lease, from: 'processing', to: 'verification_pending', executionId, now })
}

export function completeSpecialistMeshTask(store: CoordinationStore, taskId: string, lease: Lease, executionId?: string, now?: Date): Promise<WorkItem> {
  return transitionSpecialistMeshTask(store, { taskId, lease, from: 'verification_pending', to: 'completed', executionId, now })
}

export async function reconcileSpecialistMeshTakeovers(store: CoordinationStore, now?: Date): Promise<readonly WorkItem[]> {
  const recovered = await store.reconcileExpiredLeases(now)
  return Object.freeze(recovered.filter(item => item.provider === SPECIALIST_MESH_PROVIDER))
}
