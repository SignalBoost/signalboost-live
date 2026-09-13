// saas/lib/ai/cos/cosUniversityAgentExamRuntime.ts
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { requireBuilderCodingModel } from '@/lib/ai/cos/platformIdentityContext'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { loadUniversityPracticeStudyMaterial } from './cosUniversityPracticeStudyMaterialRuntime.ts'
import { readCosUniversityAgentRole } from './cosUniversityAgentRegistry.ts'
import { agentWorkDomain, modelForAgentWork, type AgentWorkDomain } from './cosUniversityAgentModelPolicy.ts'
import { enforceUniversityPracticeCostGuard } from './cosUniversityPracticeBudget.ts'
import { universityPracticeExecutionFence } from './cosUniversityPracticeExecution.ts'
import { currentUniversityPracticeModelOverride } from './cosUniversityPracticeModelContext.ts'
import {
  selectAgentCapstoneProcedures,
  SOFTWARE_CAPSTONE_ROLE,
  type AgentCapstoneRequest,
} from './cosUniversityAgentCapstone.ts'
import {
  executeBoundRegisteredSpecialist,
  isBoundRegisteredSpecialistEvidence,
  isRegisteredSpecialistIdentity,
  type BoundAgentExecution,
  type CosUniversitySpecialistRole,
} from './cosUniversityRegisteredSpecialistExecutor.ts'

export const COS_UNIVERSITY_ROLE_MODELS_SETTING_KEY = 'cos_university_role_models'
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/

/**
 * Independent exams executed as the registered learner, not as the COS generalist. Software keeps
 * its historical executor identity; every other declared specialist role uses the generic bound
 * executor with the same exact learner/run/manifest/turn provenance contract.
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

function roleModelFromSetting(value: unknown, role: CosUniversitySpecialistRole): string | null {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const nested = root.models && typeof root.models === 'object' && !Array.isArray(root.models)
    ? root.models as Record<string, unknown>
    : root
  const raw = typeof nested[role] === 'string' ? String(nested[role]).trim() : ''
  if (!raw) return null
  if (!MODEL_ID.test(raw)) throw new Error(`university_role_model_invalid:${role}`)
  return raw
}

async function readRoleDomainModel(role: CosUniversitySpecialistRole): Promise<string> {
  if (role === SOFTWARE_CAPSTONE_ROLE) return requireBuilderCodingModel()
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('system_settings')
    .select('value')
    .eq('key', COS_UNIVERSITY_ROLE_MODELS_SETTING_KEY)
    .maybeSingle()
  if (result.error) throw result.error
  const model = roleModelFromSetting(result.data?.value ?? null, role)
  if (!model) throw new Error(`university_role_model_not_configured:${role}`)
  return model
}

/** True only for a registered non-COS specialist identity. Model availability is checked at dispatch. */
export async function hasBoundAcademicExecutor(agentId: string): Promise<boolean> {
  const id = agentId.trim()
  if (!id || id === 'cos') return false
  return isRegisteredSpecialistIdentity(id, await readCosUniversityAgentRole(id))
}

export function isBoundAgentExecutionEvidence(
  value: unknown,
  expected: { id?: string; agent_id: string; manifest_hash?: string; turn_id: string | null },
  role: unknown,
  now = new Date(),
): boolean {
  return isBoundRegisteredSpecialistEvidence(value, expected, role, now)
}

export async function executeBoundAgentExam(
  request: AgentCapstoneRequest,
  /**
   * The University subject this work belongs to, when the caller knows it. Work inside the agent's
   * registered domain runs on its explicitly configured role model; the common foundation,
   * languages and retention run on the platform reasoner. Graduate specialization may pass
   * `domain: 'role_domain'` directly.
   */
  work?: { subjectId?: string | null; domain?: AgentWorkDomain },
  /** Host-resolved, buyer-controlled override for non-credit practice only. */
  practiceModelOverride?: string | null,
): Promise<{ reply: string; execution: BoundAgentExecution }> {
  await enforceUniversityPracticeCostGuard(request)
  const role = await readCosUniversityAgentRole(request.agentId)
  if (!isRegisteredSpecialistIdentity(request.agentId, role)) {
    throw new Error('agent_capstone_runtime_unavailable')
  }
  const config = localInferenceConfigFromEnv()
  const domain = work?.domain ?? agentWorkDomain(role, work?.subjectId)
  const contextualPracticeModel = request.purpose === 'practice'
    ? currentUniversityPracticeModelOverride()
    : undefined
  const selectedPracticeOverride = practiceModelOverride !== undefined
    ? practiceModelOverride
    : contextualPracticeModel
  const practiceOverride = request.purpose === 'practice' ? String(selectedPracticeOverride ?? '').trim() : ''
  const roleModel = domain === 'role_domain' && !practiceOverride
    ? await readRoleDomainModel(role as CosUniversitySpecialistRole)
    : null
  const model = practiceOverride || modelForAgentWork({
    domain,
    roleModel,
    purpose: request.purpose === 'practice' ? 'practice' : 'assessment',
  })
  return executeBoundRegisteredSpecialist(request, {
    readRole: readCosUniversityAgentRole,
    loadProcedures: loadAgentOwnProcedures,
    model,
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

export { isBoundRegisteredSpecialistEvidence }
