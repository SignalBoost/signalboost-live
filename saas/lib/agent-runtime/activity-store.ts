// saas/lib/agent-runtime/activity-store.ts

import type { AgentWorkflowResult } from './workflow-types.ts'

export interface AgentOperationActivityRecord {
  readonly workflowId: string
  readonly requestId: string
  readonly providerId?: string
  readonly outcome: AgentWorkflowResult['kind']
  readonly eventCount: number
  readonly durationMs: number
}

export interface AgentOperationActivityStore {
  record(record: AgentOperationActivityRecord): Promise<void>
}

export function createAgentOperationActivityRecord(input: {
  workflowId: string
  requestId: string
  providerId?: string
  result: AgentWorkflowResult
}): AgentOperationActivityRecord {
  return Object.freeze({
    workflowId: input.workflowId,
    requestId: input.requestId,
    providerId: input.providerId,
    outcome: input.result.kind,
    eventCount: input.result.auditEvents.length,
    durationMs: input.result.timing.totalDurationMs,
  })
}
