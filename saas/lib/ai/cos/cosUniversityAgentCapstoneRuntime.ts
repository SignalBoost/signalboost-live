import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { currentPlatformModelTopology, requireBuilderCodingModel } from '@/lib/ai/cos/platformIdentityContext'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { readCosUniversityAgentRole } from './cosUniversityAgentRegistry.ts'
import {
  executeBoundSoftwareCapstone,
  selectAgentCapstoneProcedures,
  SOFTWARE_CAPSTONE_ROLE,
  type AgentCapstoneRequest,
} from './cosUniversityAgentCapstone.ts'
import {
  executeBoundRegisteredSpecialist,
  isRegisteredSpecialistIdentity,
} from './cosUniversityRegisteredSpecialistExecutor.ts'
import { requireCosUniversityGraduationRuntime } from './cosUniversityGraduationRuntimePolicy.ts'

export async function requireRegisteredCapstoneRuntime(agentId: string): Promise<string> {
  const role = await readCosUniversityAgentRole(agentId)
  if (!role) throw new Error('unregistered_university_agent')
  requireCosUniversityGraduationRuntime(agentId, role)
  return role
}

async function loadOwnProcedures(agentId: string): Promise<string[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_cognitive_skills')
    .select('status,procedure,metadata,provenance,evaluator_approved,understanding_approved,last_validated_at')
    .contains('metadata', { origin: 'cos_university_deliberate_practice', agentId })
    .contains('provenance', { origin: 'cos_university_deliberate_practice', agentId })
    .in('status', ['validated', 'learned', 'mastered'])
    .order('last_validated_at', { ascending: false }).order('id', { ascending: true }).limit(24)
  if (result.error) throw result.error
  return selectAgentCapstoneProcedures(result.data || [], agentId)
}

function inferencePorts(model: string) {
  const config = localInferenceConfigFromEnv()
  return {
    readRole: readCosUniversityAgentRole,
    loadProcedures: loadOwnProcedures,
    model,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    infer: (input: { prompt: string; systemPrompt: string; maxTokens: number }, selectedModel: string) => callLocalModel({
      ...input,
      frequencyPenalty: 0,
      presencePenalty: 0,
    }, {
      ...config,
      model: selectedModel,
      timeoutMs: Math.min(config.timeoutMs, 90_000),
    }),
  }
}

/**
 * Graduation capstone dispatch for any registered specialist. Software keeps its historical Builder-
 * model runtime and evidence identity. Other roles use the platform reasoner for the multidisciplinary
 * common-foundation capstone; their role model is reserved for role-domain coursework/exams.
 */
export async function executeRegisteredCapstoneRuntime(request: AgentCapstoneRequest) {
  const role = await requireRegisteredCapstoneRuntime(request.agentId)
  if (!isRegisteredSpecialistIdentity(request.agentId, role)) {
    throw new Error('agent_capstone_runtime_unavailable')
  }
  if (role === SOFTWARE_CAPSTONE_ROLE) {
    return executeBoundSoftwareCapstone(request, inferencePorts(requireBuilderCodingModel()))
  }
  const model = String(currentPlatformModelTopology().primaryReasonerModel ?? '').trim()
  if (!model) throw new Error('primary_reasoner_model_not_configured')
  return executeBoundRegisteredSpecialist(request, inferencePorts(model))
}

/** Backward-compatible export used by the existing graduation runner. */
export const executeSoftwareCapstoneRuntime = executeRegisteredCapstoneRuntime
