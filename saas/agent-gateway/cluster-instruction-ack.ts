// saas/agent-gateway/cluster-instruction-ack.ts
//
// Durable dispatch and acknowledgment state for staged cluster runtime instructions.
// This module never executes infrastructure mutations; it only records delivery progress.

import type { ClusterRuntimeInstruction } from './cluster-runtime-adapter.ts'
import type { ClusterRuntimeReceipt } from './cluster-runtime-receipts.ts'

export type ClusterInstructionDispatchState = 'staged' | 'dispatched' | 'acknowledged' | 'terminal' | 'retry-pending'

export interface ClusterInstructionDeliveryRecord {
  schemaVersion: 'agent-gateway-cluster-instruction-delivery-v1'
  instructionId: string
  idempotencyKey: string
  clusterId: string
  term: number
  runtimeId: string
  state: ClusterInstructionDispatchState
  attempt: number
  lastDispatchedAt?: string
  acknowledgedAt?: string
  terminalReceiptState?: ClusterRuntimeReceipt['state']
  nextRetryAt?: string
  reason: string
  infrastructureMutationEnabled: false
  readOnly: true
  executable: false
}

export interface ClusterInstructionDeliveryStore {
  get(instructionId: string, runtimeId: string): Promise<ClusterInstructionDeliveryRecord | null>
  compareAndSet(
    instructionId: string,
    runtimeId: string,
    expectedAttempt: number,
    next: ClusterInstructionDeliveryRecord,
  ): Promise<boolean>
}

export interface ClusterInstructionReconciliation {
  schemaVersion: 'agent-gateway-cluster-instruction-reconciliation-v1'
  instructionId: string
  runtimeId: string
  disposition: 'dispatch' | 'retry' | 'await-acknowledgment' | 'complete' | 'reject-stale-term'
  reason: string
  retrySafe: boolean
  readOnly: true
  executable: false
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/

function required(value: string, field: string): string {
  const normalized = String(value || '').trim()
  if (!ID.test(normalized)) throw new Error(`invalid cluster instruction ${field}`)
  return normalized
}

function iso(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid cluster instruction clock')
  return now.toISOString()
}

function initialRecord(instruction: ClusterRuntimeInstruction, runtimeId: string): ClusterInstructionDeliveryRecord {
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-instruction-delivery-v1',
    instructionId: instruction.instructionId,
    idempotencyKey: instruction.idempotencyKey,
    clusterId: instruction.clusterId,
    term: instruction.term,
    runtimeId,
    state: 'staged',
    attempt: 0,
    reason: 'instruction staged but not yet dispatched',
    infrastructureMutationEnabled: false,
    readOnly: true,
    executable: false,
  })
}

export class ClusterInstructionAcknowledgmentController {
  private readonly store: ClusterInstructionDeliveryStore

  constructor(store: ClusterInstructionDeliveryStore) {
    this.store = store
  }

  async markDispatched(
    instruction: ClusterRuntimeInstruction,
    runtimeIdInput: string,
    now = new Date(),
  ): Promise<ClusterInstructionDeliveryRecord> {
    if (!instruction || instruction.schemaVersion !== 'agent-gateway-cluster-runtime-instruction-v1') {
      throw new Error('invalid cluster runtime instruction')
    }
    if (instruction.infrastructureMutationEnabled !== false || instruction.executable !== false) {
      throw new Error('unsafe cluster runtime instruction')
    }
    const runtimeId = required(runtimeIdInput, 'runtimeId')
    const current = (await this.store.get(instruction.instructionId, runtimeId)) ?? initialRecord(instruction, runtimeId)
    if (current.term > instruction.term) throw new Error('stale cluster instruction term rejected')
    if (current.term < instruction.term && current.attempt > 0) throw new Error('cluster instruction identity term conflict')
    if (current.state === 'acknowledged' || current.state === 'terminal') return current

    const dispatchedAt = iso(now)
    const next: ClusterInstructionDeliveryRecord = Object.freeze({
      ...current,
      state: 'dispatched',
      attempt: current.attempt + 1,
      lastDispatchedAt: dispatchedAt,
      nextRetryAt: undefined,
      reason: current.attempt === 0 ? 'instruction dispatched to governed runtime' : 'instruction redelivered using stable idempotency key',
    })
    if (!(await this.store.compareAndSet(instruction.instructionId, runtimeId, current.attempt, next))) {
      throw new Error('cluster instruction delivery changed concurrently')
    }
    return next
  }

  async acknowledge(receipt: ClusterRuntimeReceipt): Promise<ClusterInstructionDeliveryRecord> {
    if (!receipt || receipt.schemaVersion !== 'agent-gateway-cluster-runtime-receipt-v1') {
      throw new Error('invalid cluster runtime receipt')
    }
    const current = await this.store.get(receipt.instructionId, receipt.runtimeId)
    if (!current) throw new Error('cluster instruction was not dispatched')
    if (receipt.term < current.term) throw new Error('stale cluster receipt term rejected')
    if (receipt.term > current.term) throw new Error('cluster receipt term mismatch')
    if (current.state === 'terminal' || current.state === 'acknowledged') return current

    const terminal = receipt.state !== 'acknowledged'
    const next: ClusterInstructionDeliveryRecord = Object.freeze({
      ...current,
      state: terminal ? 'terminal' : 'acknowledged',
      acknowledgedAt: receipt.observedAt,
      terminalReceiptState: terminal ? receipt.state : undefined,
      nextRetryAt: undefined,
      reason: terminal ? `runtime reported terminal state: ${receipt.state}` : 'runtime acknowledged instruction delivery',
    })
    if (!(await this.store.compareAndSet(current.instructionId, current.runtimeId, current.attempt, next))) {
      throw new Error('cluster instruction acknowledgment changed concurrently')
    }
    return next
  }

  async reconcile(
    instruction: ClusterRuntimeInstruction,
    runtimeIdInput: string,
    currentClusterTerm: number,
    now = new Date(),
    retryAfterMs = 30_000,
  ): Promise<ClusterInstructionReconciliation> {
    const runtimeId = required(runtimeIdInput, 'runtimeId')
    if (!Number.isSafeInteger(currentClusterTerm) || currentClusterTerm < 0) throw new Error('invalid current cluster term')
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs < 1) throw new Error('invalid retry delay')
    const current = await this.store.get(instruction.instructionId, runtimeId)

    if (instruction.term < currentClusterTerm) {
      return Object.freeze({ schemaVersion: 'agent-gateway-cluster-instruction-reconciliation-v1', instructionId: instruction.instructionId, runtimeId, disposition: 'reject-stale-term', reason: 'instruction term is older than current cluster term', retrySafe: false, readOnly: true, executable: false })
    }
    if (!current || current.state === 'staged') {
      return Object.freeze({ schemaVersion: 'agent-gateway-cluster-instruction-reconciliation-v1', instructionId: instruction.instructionId, runtimeId, disposition: 'dispatch', reason: 'instruction has not been dispatched', retrySafe: true, readOnly: true, executable: false })
    }
    if (current.state === 'acknowledged' || current.state === 'terminal') {
      return Object.freeze({ schemaVersion: 'agent-gateway-cluster-instruction-reconciliation-v1', instructionId: instruction.instructionId, runtimeId, disposition: 'complete', reason: 'instruction delivery has a durable acknowledgment outcome', retrySafe: false, readOnly: true, executable: false })
    }

    const last = current.lastDispatchedAt ? Date.parse(current.lastDispatchedAt) : 0
    const elapsed = iso(now) && now.getTime() - last
    if (last > 0 && elapsed < retryAfterMs) {
      return Object.freeze({ schemaVersion: 'agent-gateway-cluster-instruction-reconciliation-v1', instructionId: instruction.instructionId, runtimeId, disposition: 'await-acknowledgment', reason: 'dispatch is within the acknowledgment grace period', retrySafe: true, readOnly: true, executable: false })
    }
    return Object.freeze({ schemaVersion: 'agent-gateway-cluster-instruction-reconciliation-v1', instructionId: instruction.instructionId, runtimeId, disposition: 'retry', reason: 'dispatch lacks acknowledgment after the retry boundary; redelivery is safe by idempotency key', retrySafe: true, readOnly: true, executable: false })
  }
}

export class InMemoryClusterInstructionDeliveryStore implements ClusterInstructionDeliveryStore {
  private readonly records = new Map<string, ClusterInstructionDeliveryRecord>()

  private key(instructionId: string, runtimeId: string): string {
    return `${instructionId}:${runtimeId}`
  }

  async get(instructionId: string, runtimeId: string): Promise<ClusterInstructionDeliveryRecord | null> {
    return this.records.get(this.key(instructionId, runtimeId)) ?? null
  }

  async compareAndSet(
    instructionId: string,
    runtimeId: string,
    expectedAttempt: number,
    next: ClusterInstructionDeliveryRecord,
  ): Promise<boolean> {
    const key = this.key(instructionId, runtimeId)
    const current = this.records.get(key)
    if ((current?.attempt ?? 0) !== expectedAttempt) return false
    this.records.set(key, next)
    return true
  }
}
