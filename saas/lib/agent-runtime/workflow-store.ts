import type { AgentWorkflowState } from './workflow-state.ts'
export interface AgentWorkflowStore {
  create(state: AgentWorkflowState): Promise<AgentWorkflowState>
  get(workflowId: string): Promise<AgentWorkflowState | null>
  getByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AgentWorkflowState | null>
  compareAndSet(input: { workflowId: string; expectedVersion: number; next: AgentWorkflowState; expectedLeaseOwner?: string | null; expectedLeaseToken?: string | null }): Promise<AgentWorkflowState | null>
  listRecoverable(input: { now: number; limit: number }): Promise<readonly AgentWorkflowState[]>
}
