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
  const config = localInferenceConfigFromEnv()
  const domain = work?.domain ?? agentWorkDomain(await readCosUniversityAgentRole(request.agentId), work?.subjectId)
  const model = modelForAgentWork({ domain, roleModel: requireBuilderCodingModel() })
  return executeBoundSoftwareCapstone(request, {
    readRole: readCosUniversityAgentRole, loadProcedures: loadAgentOwnProcedures, model,
    // Independent assessments never acquire source packets or study text through this port.
    ...(request.purpose === 'practice' ? { loadStudyMaterial: () => loadUniversityPracticeStudyMaterial(request) } : {}),
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    infer: (input, selectedModel) => callLocalModel({ ...input, frequencyPenalty: 0, presencePenalty: 0 }, {
      ...config, model: selectedModel, timeoutMs: Math.min(config.timeoutMs, 90_000),
    }),
  })
}

export { isBoundSoftwareCapstoneEvidence }
