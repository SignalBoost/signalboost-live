// saas/agent-gateway/replica-health.ts
//
// Host-neutral replica health, lease-renewal, abandoned-owner detection, and takeover
// planning primitives. This module never starts replicas or executes governed work.

import type { ContinuityLease, ContinuityStore } from './continuity.ts'

export type ReplicaRole = 'cos' | 'gateway'
export type ReplicaHealthState = 'healthy' | 'degraded' | 'unhealthy' | 'abandoned'

export interface ReplicaHeartbeatInput {
  replicaId: string
  role: ReplicaRole
  region: string
  version: string
  queueDepth: number
  activeLeaseCount: number
  restartCount: number
  healthScore: number
}

export interface ReplicaHeartbeat extends ReplicaHeartbeatInput {
  schemaVersion: 'agent-gateway-replica-heartbeat-v1'
  observedAt: string
  readOnly: true
  executable: false
}

export interface ReplicaHealthAssessment {
  schemaVersion: 'agent-gateway-replica-health-v1'
  replicaId: string
  state: ReplicaHealthState
  heartbeatAgeMs: number
  reason: string
  readOnly: true
  executable: false
}

export type TakeoverDisposition = 'retain-owner' | 'wait-for-expiry' | 'takeover-eligible' | 'protected-halt'

export interface TakeoverPlan {
  schemaVersion: 'agent-gateway-takeover-plan-v1'
  requestKey: string
  currentOwnerId: string
  candidateOwnerId: string
  currentFencingToken: number
  disposition: TakeoverDisposition
  reason: string
  readOnly: true
  executable: false
}

export interface ReplicaHealthStore {
  getHeartbeat(replicaId: string): Promise<ReplicaHeartbeat | null>
  putHeartbeat(heartbeat: ReplicaHeartbeat): Promise<void>
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!IDENTIFIER.test(normalized)) throw new Error(`invalid replica ${field}`)
  return normalized
}

function integer(value: number, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`invalid replica ${field}`)
  return value
}

function score(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('invalid replica healthScore')
  return value
}

function validNow(now: Date): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid replica clock')
  return now
}

export function createReplicaHeartbeat(input: ReplicaHeartbeatInput, now = new Date()): ReplicaHeartbeat {
  const observedAt = validNow(now).toISOString()
  return Object.freeze({
    schemaVersion: 'agent-gateway-replica-heartbeat-v1',
    replicaId: required(input.replicaId, 'replicaId'),
    role: input.role,
    region: required(input.region, 'region'),
    version: required(input.version, 'version'),
    queueDepth: integer(input.queueDepth, 'queueDepth'),
    activeLeaseCount: integer(input.activeLeaseCount, 'activeLeaseCount'),
    restartCount: integer(input.restartCount, 'restartCount'),
    healthScore: score(input.healthScore),
    observedAt,
    readOnly: true,
    executable: false,
  })
}

export function assessReplicaHealth(
  heartbeat: ReplicaHeartbeat | null,
  replicaId: string,
  now = new Date(),
  staleAfterMs = 15_000,
  abandonedAfterMs = 45_000,
): ReplicaHealthAssessment {
  const current = validNow(now)
  const id = required(replicaId, 'replicaId')
  integer(staleAfterMs, 'staleAfterMs', 1_000, 300_000)
  integer(abandonedAfterMs, 'abandonedAfterMs', staleAfterMs + 1, 900_000)

  if (!heartbeat) return Object.freeze({ schemaVersion: 'agent-gateway-replica-health-v1', replicaId: id, state: 'abandoned', heartbeatAgeMs: abandonedAfterMs, reason: 'heartbeat missing', readOnly: true, executable: false })
  if (heartbeat.replicaId !== id) throw new Error('replica heartbeat identity mismatch')

  const age = current.getTime() - Date.parse(heartbeat.observedAt)
  if (!Number.isFinite(age) || age < 0) throw new Error('invalid replica heartbeat time')
  let state: ReplicaHealthState = 'healthy'
  let reason = 'heartbeat current'
  if (age >= abandonedAfterMs) { state = 'abandoned'; reason = 'heartbeat abandoned' }
  else if (age >= staleAfterMs || heartbeat.healthScore < 40) { state = 'unhealthy'; reason = age >= staleAfterMs ? 'heartbeat stale' : 'health score critical' }
  else if (heartbeat.healthScore < 70) { state = 'degraded'; reason = 'health score degraded' }

  return Object.freeze({ schemaVersion: 'agent-gateway-replica-health-v1', replicaId: id, state, heartbeatAgeMs: age, reason, readOnly: true, executable: false })
}

export async function renewContinuityLease(
  store: ContinuityStore,
  lease: ContinuityLease,
  ownerId: string,
  now = new Date(),
  leaseDurationMs = 30_000,
): Promise<ContinuityLease> {
  const current = await store.getLease(lease.requestKey)
  if (!current) throw new Error('continuity lease missing')
  if (current.ownerId !== required(ownerId, 'ownerId') || current.fencingToken !== lease.fencingToken) throw new Error('continuity stale owner rejected')
  const currentTime = validNow(now)
  if (Date.parse(current.expiresAt) <= currentTime.getTime()) throw new Error('continuity lease expired')
  integer(leaseDurationMs, 'leaseDurationMs', 1_000, 300_000)
  const renewed = Object.freeze({ ...current, expiresAt: new Date(currentTime.getTime() + leaseDurationMs).toISOString() })
  await store.putLease(renewed)
  return renewed
}

export function planReplicaTakeover(
  lease: ContinuityLease,
  ownerHealth: ReplicaHealthAssessment,
  candidateOwnerId: string,
  now = new Date(),
  protectedAction = false,
): TakeoverPlan {
  const current = validNow(now)
  const candidate = required(candidateOwnerId, 'candidateOwnerId')
  if (ownerHealth.replicaId !== lease.ownerId) throw new Error('takeover owner health mismatch')
  let disposition: TakeoverDisposition
  let reason: string
  if (protectedAction) { disposition = 'protected-halt'; reason = 'consequential action requires reconciliation before takeover' }
  else if (ownerHealth.state === 'healthy' || ownerHealth.state === 'degraded') { disposition = 'retain-owner'; reason = 'current owner remains serviceable' }
  else if (Date.parse(lease.expiresAt) > current.getTime()) { disposition = 'wait-for-expiry'; reason = 'owner unhealthy but lease remains fenced' }
  else { disposition = 'takeover-eligible'; reason = 'owner abandoned and lease expired' }
  return Object.freeze({ schemaVersion: 'agent-gateway-takeover-plan-v1', requestKey: lease.requestKey, currentOwnerId: lease.ownerId, candidateOwnerId: candidate, currentFencingToken: lease.fencingToken, disposition, reason, readOnly: true, executable: false })
}

export class InMemoryReplicaHealthStore implements ReplicaHealthStore {
  private readonly heartbeats = new Map<string, ReplicaHeartbeat>()
  async getHeartbeat(replicaId: string): Promise<ReplicaHeartbeat | null> { return this.heartbeats.get(replicaId) ?? null }
  async putHeartbeat(heartbeat: ReplicaHeartbeat): Promise<void> { this.heartbeats.set(heartbeat.replicaId, heartbeat) }
}
