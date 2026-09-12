// saas/lib/ai/cos/cosUniversityAgentExamRuntime.ts
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { requireBuilderCodingModel } from '@/lib/ai/cos/platformIdentityContext'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { loadUniversityPracticeStudyMaterial } from './cosUniversityPracticeStudyMaterialRuntime.ts'
import { readCosUniversityAgentRole } from './cosUniversityAgentRegistry.ts'
import { agentWorkDomain, modelForAgentWork, type AgentWorkDomain } from './cosUniversityAgentModelPolicy.ts'
import { universityPracticeExecutionFence } from './cosUniversityPracticeExecution.ts'
import {
  executeBoundSoftwareCapstone,
  isBoundSoftwareCapstoneEvidence,
  isSoftwareCapstoneIdentity,
  selectAgentCapstoneProcedures,
  type AgentCapstoneRequest,
} from './cosUniversityAgentCapstone.ts'

const DEFAULT_MAX_PRACTICE_ROUNDS = 12

/**
 * Independent exams executed as the registered learner, not as the COS generalist. This reuses the
 * host-owned bound executor and its identity/provenance contract exactly; only the case text differs,
 * so an exam answer carries the same verifiable execution identity as a bound capstone.
 */
export async function loadAgentOwnProcedures(agentId: string): Promise<string[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_cognitive_skills')
    .select('status,procedure,metadata,provenance,evaluator_approved,understanding_approved,last_validated_at')
    .contains('metadata', { origin: 'cos_university_deliberate_practice', agentId, ...universityPracticeExecutionFence(agentId) })
    .contains('provenance', { origin: 'cos_university_deliberate_practice', agentId, ...universityPracticeExecutionFence(agentId) })
    .in('status', ['validated', 'learned', 'mastered'])
    .order('last_validated_at', { ascending: false }).order('id', { ascending: true }).limit(24)
  if (result.error) throw result.error
  return selectAgentCapstoneProcedures(result.data || [], agentId)
}

/** True only for an agent that has its own bound executor for graded University work. */
export async function hasBoundAcademicExecutor(agentId: string): Promise<boolean> {
  if (!agentId.trim() || agentId === 'cos') return false
  return isSoftwareCapstoneIdentity(agentId, await readCosUniversityAgentRole(agentId))
}

function configuredMaxPracticeRounds(): number {
  const configured = Number(process.env.UNIVERSITY_MAX_PRACTICE_ROUNDS || DEFAULT_MAX_PRACTICE_ROUNDS)
  return Number.isSafeInteger(configured) ? Math.max(2, Math.min(50, configured)) : DEFAULT_MAX_PRACTICE_ROUNDS
}

/**
 * Cost circuit breaker only. It never marks a practice pass, advances a plan, changes a rubric, or
 * creates academic evidence. A plan that repeatedly reaches this boundary remains unresolved until
 * fresh study/harness evidence changes the situation.
 */
async function enforcePracticeCostGuard(request: AgentCapstoneRequest): Promise<void> {
  if (request.purpose !== 'practice') return
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_active_practice_queue')
    .select('metadata')
    .eq('id', request.runId)
    .maybeSingle()
  if (result.error) throw result.error
  const metadata = result.data?.metadata && typeof result.data.metadata === 'object' && !Array.isArray(result.data.metadata)
    ? result.data.metadata as Record<string, unknown>
    : {}
  const practiceRound = Number(metadata.practiceRound)
  if (!Number.isSafeInteger(practiceRound) || practiceRound < 1) throw new Error('university_practice_round_missing')
  if (practiceRound > configuredMaxPracticeRounds()) throw new Error('university_practice_cost_guard_reached')
}

export async function executeBoundAgentExam(
  request: AgentCapstoneRequest,
  /**
   * The University subject this work belongs to, when the caller knows it. Work inside the agent's
   * registered domain runs on its role model; the generalist foundation, languages and retention run
   * on the platform reasoner. Callers that pass nothing get generalist routing, which is the safe
   * direction: a specialist never answers outside its field on a model tuned for that field.
   */
  work?: { subjectId?: string | null; domain?: AgentWorkDomain },
) {
  await enforcePracticeCostGuard(request)
  const config = localInferenceConfigFromEnv()
  const domain = work?.domain ?? agentWorkDomain(await readCosUniversityAgentRole(request.agentId), work?.subjectId)
  const model = modelForAgentWork({
    domain,
    roleModel: requireBuilderCodingModel(),
    purpose: request.purpose === 'practice' ? 'practice' : 'assessment',
  })
  return executeBoundSoftwareCapstone(request, {
    readRole: readCosUniversityAgentRole, loadProcedures: loadAgentOwnProcedures, model,
    // Independent assessments never acquire source packets or study text through this port.
    ...(request.purpose === 'practice' ? { loadStudyMaterial: () => loadUniversityPracticeStudyMaterial(request) } : {}),
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    infer: (input, selectedModel) => callLocalModel({
      ...input,
      frequencyPenalty: 0,
      presencePenalty: 0,
      usageContext: {
        feature: request.purpose === 'practice' ? 'university_practice' : 'university_independent_exam',
        correlationId: request.runId,
        agentId: request.agentId,
        purpose: request.purpose === 'practice' ? 'non_credit_training' : 'independent_assessment',
      },
    }, {
      ...config, model: selectedModel, timeoutMs: Math.min(config.timeoutMs, 90_000),
    }),
  })
}

export { isBoundSoftwareCapstoneEvidence }
