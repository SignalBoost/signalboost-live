import { withHostProductionHarnessIngress } from '../../../platform-harness/runtime/host-ingress.ts'
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { requireBuilderCodingModel } from '@/lib/ai/cos/platformIdentityContext'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { readCosUniversityAgentRole } from './cosUniversityAgentRegistry.ts'
import { executeBoundSoftwareCapstone, selectAgentCapstoneProcedures, type AgentCapstoneRequest } from './cosUniversityAgentCapstone.ts'
import { requireCosUniversityGraduationRuntime } from './cosUniversityGraduationRuntimePolicy.ts'
import { deepInfraMaxCallUsd, deepInfraMaxRunUsd } from './deepInfraSpendPolicy.ts'

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

/** Uses the same explicitly configured software model as Builder, without Builder's JSON envelope. */
async function executeSoftwareCapstoneRuntimeInsideHarness(request: AgentCapstoneRequest) {
  await requireRegisteredCapstoneRuntime(request.agentId)
  const config = localInferenceConfigFromEnv()
  const model = requireBuilderCodingModel()
  return executeBoundSoftwareCapstone(request, {
    readRole: readCosUniversityAgentRole, loadProcedures: loadOwnProcedures, model,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    infer: (input, selectedModel) => callLocalModel({
      ...input,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxEstimatedCostUsd: deepInfraMaxCallUsd('university_assessment'),
    }, {
      ...config, model: selectedModel, timeoutMs: Math.min(config.timeoutMs, 90_000),
    }),
  })
}


/** Graduation capstone execution is always Harness-bound. */
export async function executeSoftwareCapstoneRuntime(
  request: AgentCapstoneRequest,
): ReturnType<typeof executeSoftwareCapstoneRuntimeInsideHarness> {
  return withHostProductionHarnessIngress({
    objective: `Run University graduation capstone for ${request.agentId}`,
    portableId: 'cos-university-capstone',
    agentId: request.agentId,
    role: 'university_capstone_candidate',
    capabilityId: 'university.capstone.execute',
    risk: 'write',
    deadlineMs: 120_000,
    maxConcurrency: 1,
    maxToolCalls: 4,
    maxCostUsd: deepInfraMaxRunUsd('university_assessment'),
    runId: `university-capstone-${request.runId}`,
  }, () => executeSoftwareCapstoneRuntimeInsideHarness(request))
}
