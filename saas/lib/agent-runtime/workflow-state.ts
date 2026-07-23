import type { RuntimeLanguage, SandboxCapability } from './contracts.ts'

export type AgentWorkflowStatus = 'pending' | 'leased' | 'cancelled' | 'failed' | 'succeeded' | 'abandoned'
export const AGENT_WORKFLOW_STATUSES: readonly AgentWorkflowStatus[] = Object.freeze(['pending', 'leased', 'cancelled', 'failed', 'succeeded', 'abandoned'])
export const isTerminalWorkflowStatus = (status: AgentWorkflowStatus) => status === 'cancelled' || status === 'failed' || status === 'succeeded' || status === 'abandoned'

export interface AgentWorkflowState {
  readonly workflowId: string; readonly requestId: string; readonly userId: string; readonly idempotencyKey: string; readonly requestFingerprint: string
  readonly status: AgentWorkflowStatus; readonly version: number
  readonly leaseOwner: string | null; readonly leaseToken: string | null; readonly leaseExpiresAt: string | null
  readonly providerId: string | null; readonly language: RuntimeLanguage; readonly capabilities: readonly SandboxCapability[]; readonly estimatedCostUnits: number
  readonly quotaReservationId: string | null; readonly quotaReleased: boolean
  readonly cancellationRequested: boolean; readonly cancellationReasonCode: string | null
  readonly startedAt: string; readonly updatedAt: string; readonly completedAt: string | null
  readonly resultKind: 'denial' | 'failure' | 'success' | null; readonly failureCategory: string | null; readonly failedStage: string | null; readonly auditSequence: number; readonly createdAt: string
}

export function freezeAgentWorkflowState(state: AgentWorkflowState): AgentWorkflowState {
  return Object.freeze({ ...state, capabilities: Object.freeze([...state.capabilities]) })
}
