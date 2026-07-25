// saas/agent-gateway/cluster-runtime-receipts.ts
//
// Durable acknowledgement and verification receipts for staged cluster runtime instructions.
// This module records what a separately governed runtime reports. It never mutates infrastructure.

import type { ClusterRuntimeInstruction } from './cluster-runtime-adapter.ts'

export type ClusterRuntimeReceiptState = 'acknowledged' | 'verified' | 'rejected' | 'expired'

export interface ClusterRuntimeReceiptInput {
  instruction: ClusterRuntimeInstruction
  runtimeId: string
  state: ClusterRuntimeReceiptState
  observedAt: string
  evidenceRef?: string
  reason?: string
}

export interface ClusterRuntimeReceipt {
  schemaVersion: 'agent-gateway-cluster-runtime-receipt-v1'
  receiptId: string
  instructionId: string
  idempotencyKey: string
  clusterId: string
  term: number
  replicaId?: string
  action: ClusterRuntimeInstruction['action']
  runtimeId: string
  state: ClusterRuntimeReceiptState
  observedAt: string
  evidenceRef?: string
  reason?: string
  infrastructureMutationEnabled: false
  readOnly: true
  executable: false
}

export interface ClusterRuntimeReceiptStore {
  get(receiptId: string): Promise<ClusterRuntimeReceipt | null>
  putIfAbsent(receipt: ClusterRuntimeReceipt): Promise<boolean>
  listByInstruction(instructionId: string): Promise<readonly ClusterRuntimeReceipt[]>
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/
const EVIDENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,399}$/

function required(value: string, field: string): string {
  const normalized = String(value || '').trim()
  if (!ID.test(normalized)) throw new Error(`invalid cluster runtime receipt ${field}`)
  return normalized
}

function timestamp(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster runtime receipt observedAt')
  return new Date(parsed).toISOString()
}

function stateRank(state: ClusterRuntimeReceiptState): number {
  if (state === 'acknowledged') return 1
  return 2
}

export function createClusterRuntimeReceipt(input: ClusterRuntimeReceiptInput): ClusterRuntimeReceipt {
  const instruction = input.instruction
  if (!instruction || instruction.schemaVersion !== 'agent-gateway-cluster-runtime-instruction-v1') {
    throw new Error('invalid cluster runtime instruction')
  }
  if (instruction.infrastructureMutationEnabled !== false || instruction.executable !== false) {
    throw new Error('unsafe cluster runtime instruction')
  }

  const runtimeId = required(input.runtimeId, 'runtimeId')
  const observedAt = timestamp(input.observedAt)
  const evidenceRef = input.evidenceRef ? String(input.evidenceRef).trim() : undefined
  if (evidenceRef && !EVIDENCE.test(evidenceRef)) throw new Error('invalid cluster runtime receipt evidenceRef')
  const reason = input.reason ? String(input.reason).trim().slice(0, 500) : undefined
  const receiptId = `${instruction.instructionId}:${runtimeId}:${input.state}`

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-receipt-v1',
    receiptId,
    instructionId: instruction.instructionId,
    idempotencyKey: instruction.idempotencyKey,
    clusterId: instruction.clusterId,
    term: instruction.term,
    ...(instruction.replicaId ? { replicaId: instruction.replicaId } : {}),
    action: instruction.action,
    runtimeId,
    state: input.state,
    observedAt,
    ...(evidenceRef ? { evidenceRef } : {}),
    ...(reason ? { reason } : {}),
    infrastructureMutationEnabled: false,
    readOnly: true,
    executable: false,
  })
}

export class ClusterRuntimeReceiptController {
  // Explicit field, not a constructor parameter property. The suites run `node --test`
  // on .ts sources, which STRIPS types instead of compiling them, and strip-only mode
  // cannot emit the implicit assignment. A parameter property compiles fine in the Next
  // build and kills every suite importing the agent-gateway barrel. Guarded in prebuild
  // by scripts/validate-strip-safe.mjs.
  private readonly store: ClusterRuntimeReceiptStore

  constructor(store: ClusterRuntimeReceiptStore) {
    this.store = store
  }

  async record(input: ClusterRuntimeReceiptInput): Promise<ClusterRuntimeReceipt> {
    const receipt = createClusterRuntimeReceipt(input)
    const existing = await this.store.listByInstruction(receipt.instructionId)
    const terminal = existing.find(item => item.state !== 'acknowledged')

    if (terminal && terminal.state !== receipt.state) {
      throw new Error('cluster runtime receipt terminal state conflict')
    }
    if (terminal && stateRank(receipt.state) < stateRank(terminal.state)) {
      throw new Error('cluster runtime receipt state regression')
    }

    const duplicate = await this.store.get(receipt.receiptId)
    if (duplicate) return duplicate
    if (!(await this.store.putIfAbsent(receipt))) throw new Error('cluster runtime receipt changed concurrently')
    return receipt
  }
}

export class InMemoryClusterRuntimeReceiptStore implements ClusterRuntimeReceiptStore {
  private readonly receipts = new Map<string, ClusterRuntimeReceipt>()

  async get(receiptId: string): Promise<ClusterRuntimeReceipt | null> {
    return this.receipts.get(receiptId) ?? null
  }

  async putIfAbsent(receipt: ClusterRuntimeReceipt): Promise<boolean> {
    if (this.receipts.has(receipt.receiptId)) return false
    this.receipts.set(receipt.receiptId, receipt)
    return true
  }

  async listByInstruction(instructionId: string): Promise<readonly ClusterRuntimeReceipt[]> {
    return Object.freeze(
      [...this.receipts.values()]
        .filter(receipt => receipt.instructionId === instructionId)
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.receiptId.localeCompare(b.receiptId)),
    )
  }
}
