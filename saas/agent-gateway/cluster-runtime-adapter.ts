// saas/agent-gateway/cluster-runtime-adapter.ts
//
// Translates committed cluster leadership state into immutable runtime instructions.
// This module never mutates infrastructure and all instructions remain non-executable.

import type { ClusterTransitionCommit } from './cluster-state-transition.ts'

export type ClusterRuntimeAction = 'promote' | 'demote' | 'drain' | 'activate' | 'remove' | 'noop'

export interface ClusterRuntimeInstruction {
  schemaVersion: 'agent-gateway-cluster-runtime-instruction-v1'
  instructionId: string
  clusterId: string
  term: number
  replicaId?: string
  action: ClusterRuntimeAction
  reason: string
  idempotencyKey: string
  requiresGovernedRuntime: true
  infrastructureMutationEnabled: false
  readOnly: true
  executable: false
}

export interface ClusterRuntimeInstructionStore {
  get(idempotencyKey: string): Promise<ClusterRuntimeInstruction | null>
  putIfAbsent(instruction: ClusterRuntimeInstruction): Promise<boolean>
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/
function required(value: string, field: string): string {
  const v = value.trim()
  if (!ID.test(v)) throw new Error(`invalid cluster runtime ${field}`)
  return v
}

function createInstruction(input: { clusterId: string; term: number; replicaId?: string; action: ClusterRuntimeAction; reason: string }): ClusterRuntimeInstruction {
  const clusterId = required(input.clusterId, 'clusterId')
  if (!Number.isSafeInteger(input.term) || input.term < 0) throw new Error('invalid cluster runtime term')
  const replicaId = input.replicaId ? required(input.replicaId, 'replicaId') : undefined
  const target = replicaId ?? 'cluster'
  const idempotencyKey = `${clusterId}:${input.term}:${input.action}:${target}`
  return Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-instruction-v1', instructionId: idempotencyKey, clusterId, term: input.term, ...(replicaId ? { replicaId } : {}), action: input.action, reason: input.reason, idempotencyKey, requiresGovernedRuntime: true, infrastructureMutationEnabled: false, readOnly: true, executable: false })
}

export function translateClusterTransition(commit: ClusterTransitionCommit): readonly ClusterRuntimeInstruction[] {
  if (!commit || commit.schemaVersion !== 'agent-gateway-cluster-transition-commit-v1') throw new Error('invalid cluster transition commit')
  const instructions: ClusterRuntimeInstruction[] = []
  if (commit.promotedReplicaId) instructions.push(createInstruction({ clusterId: commit.clusterId, term: commit.term, replicaId: commit.promotedReplicaId, action: 'promote', reason: 'committed cluster leader promotion' }))
  for (const replicaId of [...commit.demotedReplicaIds].sort()) instructions.push(createInstruction({ clusterId: commit.clusterId, term: commit.term, replicaId, action: 'demote', reason: 'committed conflicting or previous leader demotion' }))
  if (instructions.length === 0) instructions.push(createInstruction({ clusterId: commit.clusterId, term: commit.term, action: 'noop', reason: 'cluster transition requires no runtime membership change' }))
  return Object.freeze(instructions)
}

export class ClusterRuntimeAdapterContract {
  constructor(private readonly store: ClusterRuntimeInstructionStore) {}
  async stage(commit: ClusterTransitionCommit): Promise<readonly ClusterRuntimeInstruction[]> {
    const staged: ClusterRuntimeInstruction[] = []
    for (const instruction of translateClusterTransition(commit)) {
      const current = await this.store.get(instruction.idempotencyKey)
      if (current) { staged.push(current); continue }
      if (!(await this.store.putIfAbsent(instruction))) throw new Error('cluster runtime instruction changed concurrently')
      staged.push(instruction)
    }
    return Object.freeze(staged)
  }
}

export class InMemoryClusterRuntimeInstructionStore implements ClusterRuntimeInstructionStore {
  private readonly instructions = new Map<string, ClusterRuntimeInstruction>()
  async get(idempotencyKey: string): Promise<ClusterRuntimeInstruction | null> { return this.instructions.get(idempotencyKey) ?? null }
  async putIfAbsent(instruction: ClusterRuntimeInstruction): Promise<boolean> {
    if (this.instructions.has(instruction.idempotencyKey)) return false
    this.instructions.set(instruction.idempotencyKey, instruction)
    return true
  }
}
