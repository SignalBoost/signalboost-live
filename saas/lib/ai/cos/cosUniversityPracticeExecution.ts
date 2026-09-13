// saas/lib/ai/cos/cosUniversityPracticeExecution.ts
import { createHash, randomUUID } from 'node:crypto'
import { callLocalModel, localInferenceConfigFromEnv } from '../local-inference.ts'
import { universityPracticeModelFromEnv } from './cosUniversityAgentModelPolicy.ts'
import { currentUniversityPracticeModelOverride } from './cosUniversityPracticeModelContext.ts'
import {
  enforceUniversityPracticeCostGuard,
  meterUniversityPracticeInvocation,
} from './cosUniversityPracticeBudget.ts'
import {
  isBoundSoftwareCapstoneEvidence,
  SOFTWARE_CAPSTONE_ROLE,
  SOFTWARE_CAPSTONE_RUNTIME,
  type AgentCapstoneExecution,
  type AgentCapstoneRequest,
} from './cosUniversityAgentCapstone.ts'

export const BOUND_PRACTICE_VERSION = 'agent_bound_practice_v1' as const
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

async function executeCosPracticeOnConfiguredEconomyModel(
  request: AgentCapstoneRequest,
  practiceModelOverride?: string | null,
): Promise<ReasonerResult | null> {
  // Direct/low-level callers preserve the original env-only fail-closed contract. The host runner
  // may inject a buyer-controlled request-local model without mutating process.env.
  const contextualModel = currentUniversityPracticeModelOverride()
  const practiceModel = practiceModelOverride !== undefined
    ? practiceModelOverride
    : contextualModel !== undefined
      ? contextualModel
      : universityPracticeModelFromEnv()
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
  if (!text) throw new Error('university_practice_economy_inference_unavailable')
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
    practiceModel?: string | null
  },
): Promise<UniversityPracticeExecution | null> {
  const practiceRequest = { ...request, purpose: 'practice' as const }
  await enforceUniversityPracticeCostGuard(practiceRequest)
  await meterUniversityPracticeInvocation(practiceRequest)
  if (request.agentId === 'cos') {
    const economy = await executeCosPracticeOnConfiguredEconomyModel(request, ports.practiceModel)
    if (economy) return {
      ...economy,
      responseSource: 'cos_university_practice_model',
      executionProvenance: null,
    }
    const result = await ports.cos()
    return result ? {
      ...result,
      responseSource: 'cos_local_reasoner',
      executionProvenance: null,
    } : null
  }
  const { reply, execution } = await ports.bound(practiceRequest)
  if (typeof reply !== 'string' || !reply.trim() || !execution
    || !isBoundSoftwareCapstoneEvidence(execution, {
      id: request.runId, agent_id: request.agentId, manifest_hash: request.manifestHash,
      turn_id: execution.turnId,
      // Verify against the role the receipt itself declares, so a cybersecurity specialist is
      // checked as cybersecurity rather than against software's constants.
    }, execution.role)
    || execution.responseHash !== createHash('sha256').update(reply).digest('hex')) {
    throw new Error('university_practice_execution_binding_invalid')
  }
  return {
    text: reply, turnId: execution.turnId,
    reasoner: { kind: execution.runtime, label: execution.model },
    responseSource: execution.runtime,
    executionProvenance: execution,
  }
}
