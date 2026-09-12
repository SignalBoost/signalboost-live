import { createHash } from 'node:crypto'
import {
  isBoundSoftwareCapstoneEvidence,
  SOFTWARE_CAPSTONE_ROLE,
  SOFTWARE_CAPSTONE_RUNTIME,
  type AgentCapstoneExecution,
  type AgentCapstoneRequest,
} from './cosUniversityAgentCapstone.ts'

export const BOUND_PRACTICE_VERSION = 'agent_bound_practice_v1' as const

type ReasonerResult = { text: string; turnId: string; reasoner: { kind: string; label: string } }
export type UniversityPracticeExecution = ReasonerResult & {
  responseSource: string
  executionProvenance: AgentCapstoneExecution | null
}

/** New specialist practice never reuses a COS-produced skill, prompt variant, or queue result. */
export function universityPracticeExecutionKey(agentId: string, planKey: string): string {
  return agentId === 'cos' ? planKey : createHash('sha256')
    .update(JSON.stringify([BOUND_PRACTICE_VERSION, agentId, planKey])).digest('hex')
}

export function universityPracticeExecutionFence(agentId: string): Record<string, string> {
  return agentId === 'cos' ? {} : { executionBinding: BOUND_PRACTICE_VERSION }
}

/** Host dispatch only. Rubrics stay in the caller and never reach either inference port. */
export async function executeUniversityPractice(
  request: AgentCapstoneRequest,
  ports: {
    cos(): Promise<ReasonerResult | null>
    bound(request: AgentCapstoneRequest): Promise<{ reply: string; execution: AgentCapstoneExecution }>
  },
): Promise<UniversityPracticeExecution | null> {
  if (request.agentId === 'cos') {
    const result = await ports.cos()
    return result ? { ...result, responseSource: 'cos_local_reasoner', executionProvenance: null } : null
  }
  const { reply, execution } = await ports.bound({ ...request, purpose: 'practice' })
  if (typeof reply !== 'string' || !reply.trim() || !execution
    || !isBoundSoftwareCapstoneEvidence(execution, {
      id: request.runId, agent_id: request.agentId, manifest_hash: request.manifestHash,
      turn_id: execution.turnId,
    }, SOFTWARE_CAPSTONE_ROLE)
    || execution.responseHash !== createHash('sha256').update(reply).digest('hex')) {
    throw new Error('university_practice_execution_binding_invalid')
  }
  return {
    text: reply, turnId: execution.turnId,
    reasoner: { kind: SOFTWARE_CAPSTONE_RUNTIME, label: execution.model },
    responseSource: SOFTWARE_CAPSTONE_RUNTIME,
    executionProvenance: execution,
  }
}
