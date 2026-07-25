// saas/agent-gateway/cluster-delivery-diagnostics.ts
//
// Read-only delivery diagnostics for staged cluster runtime instructions.
// This module aggregates durable delivery state without exposing execution controls.

import type { ClusterInstructionDeliveryRecord } from './cluster-instruction-ack.ts'
import type { ClusterRuntimeInstruction } from './cluster-runtime-adapter.ts'
import type { ClusterRuntimeReceipt } from './cluster-runtime-receipts.ts'

export type ClusterDeliveryDiagnosticStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'
export type ClusterDeliveryDiagnosticState = 'staged' | 'dispatched' | 'retrying' | 'acknowledged' | 'terminal' | 'stale-term'

export interface ClusterDeliveryDiagnosticItem {
  schemaVersion: 'agent-gateway-cluster-delivery-diagnostic-item-v1'
  instructionId: string
  clusterId: string
  term: number
  runtimeId: string | null
  replicaId: string | null
  action: ClusterRuntimeInstruction['action']
  state: ClusterDeliveryDiagnosticState
  attempt: number
  lastDispatchedAt: string | null
  acknowledgedAt: string | null
  terminalReceiptState: ClusterRuntimeReceipt['state'] | null
  reason: string
  readOnly: true
  infrastructureMutationEnabled: false
  executable: false
}

export interface ClusterDeliveryDiagnosticsSnapshot {
  schemaVersion: 'agent-gateway-cluster-delivery-diagnostics-v1'
  generatedAt: string
  clusterId: string
  currentTerm: number
  status: ClusterDeliveryDiagnosticStatus
  counts: Readonly<Record<ClusterDeliveryDiagnosticState, number>>
  totalInstructions: number
  retryRequired: number
  staleTermCount: number
  items: readonly ClusterDeliveryDiagnosticItem[]
  safety: Readonly<{ readOnly: true; infrastructureMutationEnabled: false; runtimeExecutionControlsExposed: false }>
  executable: false
}

function iso(value: string): string {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('invalid cluster delivery diagnostics timestamp')
  return new Date(parsed).toISOString()
}

function stateFor(instruction: ClusterRuntimeInstruction, delivery: ClusterInstructionDeliveryRecord | null, currentTerm: number): ClusterDeliveryDiagnosticState {
  if (instruction.term < currentTerm) return 'stale-term'
  if (!delivery || delivery.state === 'staged') return 'staged'
  if (delivery.state === 'retry-pending' || delivery.attempt > 1 && delivery.state === 'dispatched') return 'retrying'
  if (delivery.state === 'dispatched') return 'dispatched'
  if (delivery.state === 'acknowledged') return 'acknowledged'
  return 'terminal'
}

function statusFor(counts: Readonly<Record<ClusterDeliveryDiagnosticState, number>>): ClusterDeliveryDiagnosticStatus {
  if (counts['stale-term'] > 0) return 'critical'
  if (counts.retrying > 0 || counts.terminal > 0) return 'degraded'
  if (counts.staged > 0 || counts.dispatched > 0) return 'unknown'
  return 'healthy'
}

export function createClusterDeliveryDiagnostics(input: {
  generatedAt: string
  clusterId: string
  currentTerm: number
  instructions: readonly ClusterRuntimeInstruction[]
  deliveries: readonly ClusterInstructionDeliveryRecord[]
}): ClusterDeliveryDiagnosticsSnapshot {
  if (!Number.isSafeInteger(input.currentTerm) || input.currentTerm < 0) throw new Error('invalid cluster delivery current term')
  const generatedAt = iso(input.generatedAt)
  const deliveryByInstruction = new Map(input.deliveries.map(item => [item.instructionId, item]))
  const seen = new Set<string>()
  const items = [...input.instructions].sort((a, b) => a.instructionId.localeCompare(b.instructionId)).map(instruction => {
    if (instruction.clusterId !== input.clusterId) throw new Error('cluster delivery diagnostics instruction mismatch')
    if (seen.has(instruction.instructionId)) throw new Error('duplicate cluster delivery instruction')
    seen.add(instruction.instructionId)
    const delivery = deliveryByInstruction.get(instruction.instructionId) ?? null
    if (delivery && (delivery.clusterId !== input.clusterId || delivery.term !== instruction.term)) throw new Error('cluster delivery diagnostics record mismatch')
    const state = stateFor(instruction, delivery, input.currentTerm)
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-delivery-diagnostic-item-v1' as const,
      instructionId: instruction.instructionId,
      clusterId: instruction.clusterId,
      term: instruction.term,
      runtimeId: delivery?.runtimeId ?? null,
      replicaId: instruction.replicaId ?? null,
      action: instruction.action,
      state,
      attempt: delivery?.attempt ?? 0,
      lastDispatchedAt: delivery?.lastDispatchedAt ?? null,
      acknowledgedAt: delivery?.acknowledgedAt ?? null,
      terminalReceiptState: delivery?.terminalReceiptState ?? null,
      reason: delivery?.reason ?? 'instruction staged without delivery record',
      readOnly: true as const,
      infrastructureMutationEnabled: false as const,
      executable: false as const,
    })
  })
  const counts: Record<ClusterDeliveryDiagnosticState, number> = { staged: 0, dispatched: 0, retrying: 0, acknowledged: 0, terminal: 0, 'stale-term': 0 }
  for (const item of items) counts[item.state] += 1
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-delivery-diagnostics-v1',
    generatedAt,
    clusterId: input.clusterId,
    currentTerm: input.currentTerm,
    status: statusFor(counts),
    counts: Object.freeze(counts),
    totalInstructions: items.length,
    retryRequired: counts.retrying,
    staleTermCount: counts['stale-term'],
    items: Object.freeze(items),
    safety: Object.freeze({ readOnly: true, infrastructureMutationEnabled: false, runtimeExecutionControlsExposed: false }),
    executable: false,
  })
}
