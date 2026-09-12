import { createHash, randomUUID } from 'node:crypto'
import { callLocalModel, localInferenceConfigFromEnv } from '../local-inference.ts'
import { universityPracticeModelFromEnv } from './cosUniversityAgentModelPolicy.ts'
import {
  isBoundSoftwareCapstoneEvidence,
  SOFTWARE_CAPSTONE_ROLE,
  SOFTWARE_CAPSTONE_RUNTIME,
  type AgentCapstoneExecution,
  type AgentCapstoneRequest,
} from './cosUniversityAgentCapstone.ts'

export const BOUND_PRACTICE_VERSION = 'agent_bound_practice_v1' as const
const DEFAULT_MAX_PRACTICE_ROUNDS = 12
const COS_PRACTICE_SYSTEM_PROMPT = [
  'You are COS executing one bounded University deliberate-practice exercise.',
  'This is training, not an owner-facing advisory answer and not an independent academic exam.',
  'Use the supplied case faithfully, preserve unknowns, and do not invent live or Production facts.',
  'Return strict JSON only: {"answer":"...","confidence":0.0}.',
  'Do not mention or reconstruct the hidden rubric.',
].join(' ')

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

function configuredMaxPracticeRounds(): number {
  const configured = Number(process.env.UNIVERSITY_MAX_PRACTICE_ROUNDS || DEFAULT_MAX_PRACTICE_ROUNDS)
  return Number.isSafeInteger(configured) ? Math.max(2, Math.min(50, configured)) : DEFAULT_MAX_PRACTICE_ROUNDS
}

/**
 * Common cost guard for every learner, including COS. The queue row is host-owned metadata; the
 * guard never creates a pass, changes a grade, or advances a study plan.
 */
async function enforceCommonPracticeCostGuard(request: AgentCapstoneRequest): Promise<void> {
  if (process.env.COS_UNIVERSITY_PRACTICE_ENABLED !== 'true') return
  const { cosServiceDb } = await import('../../cos-core/storage/supabase.ts')
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_active_practice_queue').select('metadata').eq('id', request.runId).maybeSingle()
  if (result.error) throw result.error
  const metadata = result.data?.metadata && typeof result.data.metadata === 'object' && !Array.isArray(result.data.metadata)
    ? result.data.metadata as Record<string, unknown>
    : {}
  const practiceRound = Number(metadata.practiceRound)
  if (!Number.isSafeInteger(practiceRound) || practiceRound < 1) throw new Error('university_practice_round_missing')
  if (practiceRound > configuredMaxPracticeRounds()) throw new Error('university_practice_cost_guard_reached')
}

async function executeCosPracticeOnConfiguredEconomyModel(request: AgentCapstoneRequest): Promise<ReasonerResult | null> {
  const practiceModel = universityPracticeModelFromEnv()
  if (!practiceModel) return null
  const config = localInferenceConfigFromEnv()
  const text = await callLocalModel({
    prompt: request.prompt,
    systemPrompt: COS_PRACTICE_SYSTEM_PROMPT,
    maxTokens: 1800,
    temperature: 0.1,
    usageContext: {
      feature: 'university_practice',
      correlationId: request.runId,
      agentId: request.agentId,
      purpose: 'non_credit_training',
    },
  }, { ...config, model: practiceModel, timeoutMs: Math.min(config.timeoutMs, 90_000) })
  if (!text) return null
  return {
    text,
    turnId: randomUUID(),
    reasoner: { kind: 'managed-open-model', label: `university-practice:${practiceModel}` },
  }
}

/** Host dispatch only. Rubrics stay in the caller and never reach either inference port. */
export async function executeUniversityPractice(
  request: AgentCapstoneRequest,
  ports: {
    cos(): Promise<ReasonerResult | null>
    bound(request: AgentCapstoneRequest): Promise<{ reply: string; execution: AgentCapstoneExecution }>
  },
): Promise<UniversityPracticeExecution | null> {
  await enforceCommonPracticeCostGuard({ ...request, purpose: 'practice' })
  if (request.agentId === 'cos') {
    const economy = await executeCosPracticeOnConfiguredEconomyModel(request)
    const result = economy || await ports.cos()
    return result ? {
      ...result,
      responseSource: economy ? 'cos_university_practice_model' : 'cos_local_reasoner',
      executionProvenance: null,
    } : null
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
