// saas/agent-gateway/cluster-runtime-reconciliation.ts
//
// Read-only reconciliation for staged cluster runtime instructions and durable receipts.
// Produces diagnostics and retry recommendations only; it never executes or mutates infrastructure.

import type { ClusterRuntimeInstruction } from './cluster-runtime-adapter.ts'
import type { ClusterRuntimeReceipt, ClusterRuntimeReceiptState } from './cluster-runtime-receipts.ts'

export type ClusterRuntimeReconciliationState = 'verified' | 'pending' | 'retry-recommended' | 'blocked'

export interface ClusterRuntimeInstructionReconciliation {
  instructionId: string
  clusterId: string
  term: number
  replicaId?: string
  action: ClusterRuntimeInstruction['action']
  state: ClusterRuntimeReconciliationState
  receiptCount: number
  duplicateReceiptCount: number
  latestReceiptState?: ClusterRuntimeReceiptState
  latestObservedAt?: string
  issues: readonly string[]
  retryRecommended: boolean
  retryReason?: string
}

export interface ClusterRuntimeReconciliationSnapshot {
  schemaVersion: 'agent-gateway-cluster-runtime-reconciliation-v1'
  generatedAt: string
  summary: {
    instructionCount: number
    verified: number
    pending: number
    retryRecommended: number
    blocked: number
    duplicateReceipts: number
  }
  instructions: readonly ClusterRuntimeInstructionReconciliation[]
  infrastructureMutationEnabled: false
  automaticRetryEnabled: false
  readOnly: true
  executable: false
}

function validTime(value: string, field: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`invalid cluster runtime reconciliation ${field}`)
  return parsed
}

function validateInstruction(instruction: ClusterRuntimeInstruction): void {
  if (!instruction || instruction.schemaVersion !== 'agent-gateway-cluster-runtime-instruction-v1') {
    throw new Error('invalid cluster runtime reconciliation instruction')
  }
  if (instruction.infrastructureMutationEnabled !== false || instruction.executable !== false) {
    throw new Error('unsafe cluster runtime reconciliation instruction')
  }
}

function validateReceipt(instruction: ClusterRuntimeInstruction, receipt: ClusterRuntimeReceipt): void {
  if (!receipt || receipt.schemaVersion !== 'agent-gateway-cluster-runtime-receipt-v1') {
    throw new Error('invalid cluster runtime reconciliation receipt')
  }
  if (receipt.instructionId !== instruction.instructionId || receipt.clusterId !== instruction.clusterId || receipt.term !== instruction.term) {
    throw new Error('cluster runtime reconciliation receipt identity mismatch')
  }
  if (receipt.infrastructureMutationEnabled !== false || receipt.executable !== false) {
    throw new Error('unsafe cluster runtime reconciliation receipt')
  }
  validTime(receipt.observedAt, 'receipt timestamp')
}

export function reconcileClusterRuntimeInstructions(input: {
  instructions: readonly ClusterRuntimeInstruction[]
  receipts: readonly ClusterRuntimeReceipt[]
  generatedAt: string
  acknowledgementTimeoutMs?: number
}): ClusterRuntimeReconciliationSnapshot {
  const generatedAtMs = validTime(input.generatedAt, 'generatedAt')
  const timeout = input.acknowledgementTimeoutMs ?? 300_000
  if (!Number.isSafeInteger(timeout) || timeout < 0) throw new Error('invalid cluster runtime reconciliation timeout')

  const instructionIds = new Set<string>()
  for (const instruction of input.instructions) {
    validateInstruction(instruction)
    if (instructionIds.has(instruction.instructionId)) throw new Error('duplicate cluster runtime reconciliation instruction')
    instructionIds.add(instruction.instructionId)
  }

  const receiptsByInstruction = new Map<string, ClusterRuntimeReceipt[]>()
  for (const receipt of input.receipts) {
    const instruction = input.instructions.find(item => item.instructionId === receipt.instructionId)
    if (!instruction) throw new Error('orphan cluster runtime reconciliation receipt')
    validateReceipt(instruction, receipt)
    const list = receiptsByInstruction.get(receipt.instructionId) ?? []
    list.push(receipt)
    receiptsByInstruction.set(receipt.instructionId, list)
  }

  const reconciled = [...input.instructions]
    .sort((a, b) => a.instructionId.localeCompare(b.instructionId))
    .map(instruction => {
      const receipts = [...(receiptsByInstruction.get(instruction.instructionId) ?? [])]
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.receiptId.localeCompare(b.receiptId))
      const uniqueReceiptIds = new Set(receipts.map(receipt => receipt.receiptId))
      const duplicateReceiptCount = receipts.length - uniqueReceiptIds.size
      const terminalStates = new Set(receipts.filter(receipt => receipt.state !== 'acknowledged').map(receipt => receipt.state))
      const latest = receipts[receipts.length - 1]
      const issues: string[] = []
      let state: ClusterRuntimeReconciliationState = 'pending'
      let retryRecommended = false
      let retryReason: string | undefined

      if (duplicateReceiptCount > 0) issues.push('duplicate_receipts')
      if (terminalStates.size > 1) {
        issues.push('conflicting_terminal_states')
        state = 'blocked'
      } else if (latest?.state === 'verified') {
        state = 'verified'
      } else if (latest?.state === 'rejected') {
        state = 'blocked'
        issues.push('runtime_rejected_instruction')
      } else if (latest?.state === 'expired') {
        state = 'retry-recommended'
        retryRecommended = true
        retryReason = 'runtime receipt expired'
        issues.push('expired_receipt')
      } else if (!latest) {
        state = 'retry-recommended'
        retryRecommended = true
        retryReason = 'no runtime receipt observed'
        issues.push('missing_receipt')
      } else if (generatedAtMs - validTime(latest.observedAt, 'receipt timestamp') > timeout) {
        state = 'retry-recommended'
        retryRecommended = true
        retryReason = 'acknowledgement exceeded reconciliation timeout'
        issues.push('acknowledgement_timeout')
      }

      return Object.freeze({
        instructionId: instruction.instructionId,
        clusterId: instruction.clusterId,
        term: instruction.term,
        ...(instruction.replicaId ? { replicaId: instruction.replicaId } : {}),
        action: instruction.action,
        state,
        receiptCount: receipts.length,
        duplicateReceiptCount,
        ...(latest ? { latestReceiptState: latest.state, latestObservedAt: latest.observedAt } : {}),
        issues: Object.freeze(issues.sort()),
        retryRecommended,
        ...(retryReason ? { retryReason } : {}),
      })
    })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-reconciliation-v1',
    generatedAt: new Date(generatedAtMs).toISOString(),
    summary: {
      instructionCount: reconciled.length,
      verified: reconciled.filter(item => item.state === 'verified').length,
      pending: reconciled.filter(item => item.state === 'pending').length,
      retryRecommended: reconciled.filter(item => item.state === 'retry-recommended').length,
      blocked: reconciled.filter(item => item.state === 'blocked').length,
      duplicateReceipts: reconciled.reduce((total, item) => total + item.duplicateReceiptCount, 0),
    },
    instructions: Object.freeze(reconciled),
    infrastructureMutationEnabled: false,
    automaticRetryEnabled: false,
    readOnly: true,
    executable: false,
  })
}
