import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { A2ADelegationRisk } from './a2a-agent-registry.ts'
import {
  loadProductionSpecialistBindingDescriptors,
  type ProductionSpecialistBindingDescriptor,
} from './a2a-production-specialist-composition.ts'
import { createSupabaseSpecialistMeshProductionAdapters } from './specialist-mesh-production-adapters.ts'
import {
  listCosUniversityRegisteredAgents,
  type CosUniversityRegisteredAgent,
} from '../lib/ai/cos/cosUniversityAgentRegistry.ts'
import type { CosUniversityAgentRole } from '../lib/ai/cos/cosUniversityRoleCurriculum.ts'
import type { CosUniversitySubjectId } from '../lib/ai/cos/cosUniversity.ts'
import { selectCosUniversityStudyStrategy } from '../lib/ai/cos/cosUniversityStudyStrategy.ts'

export const SPECIALIST_MESH_UNIVERSITY_COVERAGE_VERSION = 'signalboost-specialist-mesh-university-coverage-v1' as const

export type SpecialistMeshCoverageStatus = 'covered' | 'training_priority' | 'authorization_gap' | 'unassigned'

export type SpecialistMeshCoverageCapability = Readonly<{
  coverageKey: string
  tenantId: string
  environmentId: string
  portableId: string
  skillId: string
  risk: A2ADelegationRisk
  authorizedAgentIds: readonly string[]
  subjectId: CosUniversitySubjectId
  eligibleRoles: readonly CosUniversityAgentRole[]
}>

export type SpecialistMeshCoverageDecision = Readonly<{
  capability: SpecialistMeshCoverageCapability
  targetQualifiedCount: number
  qualifiedAuthorizedAgentIds: readonly string[]
  qualificationEvidenceRefs: Readonly<Record<string, string>>
  candidateAgentId: string | null
  candidateRole: CosUniversityAgentRole | null
  candidateAuthorized: boolean | null
  status: SpecialistMeshCoverageStatus
  priority: number
}>

export type SpecialistMeshUniversityCoverageSummary = Readonly<{
  version: typeof SPECIALIST_MESH_UNIVERSITY_COVERAGE_VERSION
  enabled: boolean
  configuredCapabilities: number
  coveredCapabilities: number
  gaps: number
  trainingPriorities: number
  authorizationGaps: number
  unassignedGaps: number
  studyPlansCreated: number
  decisions: readonly SpecialistMeshCoverageDecision[]
  errors: readonly string[]
  semantics: 'coverage_priorities_create_education_only_never_authority'
}>

type ExistingCoverageRow = Readonly<{
  coverage_key: string
  candidate_agent_id: string | null
  study_plan_id: string | null
}>

const ROLE_POLICY: ReadonlyArray<Readonly<{
  prefix: string
  subjectId: CosUniversitySubjectId
  roles: readonly CosUniversityAgentRole[]
}>> = Object.freeze([
  Object.freeze({
    prefix: 'software.',
    subjectId: 'computer_science',
    roles: Object.freeze(['software_engineering', 'cybersecurity', 'chief_of_staff_generalist'] as CosUniversityAgentRole[]),
  }),
  Object.freeze({
    prefix: 'self-healing.',
    subjectId: 'computer_science',
    roles: Object.freeze(['software_engineering', 'cybersecurity', 'enterprise_operations_governance', 'chief_of_staff_generalist'] as CosUniversityAgentRole[]),
  }),
  Object.freeze({
    prefix: 'marketing.',
    subjectId: 'business_operations',
    roles: Object.freeze(['enterprise_operations_governance', 'chief_of_staff_generalist'] as CosUniversityAgentRole[]),
  }),
  Object.freeze({
    prefix: 'sales.',
    subjectId: 'business_operations',
    roles: Object.freeze(['enterprise_operations_governance', 'chief_of_staff_generalist'] as CosUniversityAgentRole[]),
  }),
])

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

function curriculumForSkill(skillId: string): { subjectId: CosUniversitySubjectId; roles: readonly CosUniversityAgentRole[] } {
  const rule = ROLE_POLICY.find(item => skillId.startsWith(item.prefix))
  if (rule) return { subjectId: rule.subjectId, roles: rule.roles }
  return {
    subjectId: 'reasoning_decision_science',
    roles: Object.freeze(['chief_of_staff_generalist'] as CosUniversityAgentRole[]),
  }
}

function riskPriority(risk: A2ADelegationRisk, shortage: number): number {
  const base = risk === 'consequential' ? 97 : risk === 'write' ? 94 : 90
  return Math.min(100, base + Math.max(0, shortage - 1))
}

function capabilityKey(input: {
  tenantId: string
  environmentId: string
  portableId: string
  skillId: string
  risk: A2ADelegationRisk
}): string {
  return `smuc:${hash([input.tenantId, input.environmentId, input.portableId, input.skillId, input.risk])}`
}

/**
 * Production manifests are the authority boundary for the coverage map. The map cannot invent a
 * capability, widen scope, or change an assignment. Duplicate manifests for the same exact capability
 * simply contribute another independently authorized agent.
 */
export function buildSpecialistMeshCoverageCapabilities(
  descriptors: readonly ProductionSpecialistBindingDescriptor[],
): readonly SpecialistMeshCoverageCapability[] {
  const grouped = new Map<string, {
    tenantId: string
    environmentId: string
    portableId: string
    skillId: string
    risk: A2ADelegationRisk
    agentIds: Set<string>
  }>()

  for (const descriptor of descriptors) {
    const manifest = descriptor.manifest
    for (const skill of manifest.approvedSkills) {
      const key = capabilityKey({
        tenantId: manifest.tenantId,
        environmentId: manifest.environmentId,
        portableId: manifest.portableId,
        skillId: skill.skillId,
        risk: skill.risk,
      })
      const current = grouped.get(key) ?? {
        tenantId: manifest.tenantId,
        environmentId: manifest.environmentId,
        portableId: manifest.portableId,
        skillId: skill.skillId,
        risk: skill.risk,
        agentIds: new Set<string>(),
      }
      current.agentIds.add(manifest.agentId)
      grouped.set(key, current)
    }
  }

  return Object.freeze([...grouped.entries()].map(([coverageKey, item]) => {
    const curriculum = curriculumForSkill(item.skillId)
    return Object.freeze({
      coverageKey,
      tenantId: item.tenantId,
      environmentId: item.environmentId,
      portableId: item.portableId,
      skillId: item.skillId,
      risk: item.risk,
      authorizedAgentIds: Object.freeze([...item.agentIds].sort()),
      subjectId: curriculum.subjectId,
      eligibleRoles: curriculum.roles,
    })
  }).sort((a, b) => a.coverageKey.localeCompare(b.coverageKey)))
}

/**
 * Selects education work only. Qualification evidence never grants assignment authority, and an
 * academic candidate never becomes qualified merely because it was selected for study.
 */
export function decideSpecialistMeshUniversityCoverage(input: {
  capability: SpecialistMeshCoverageCapability
  targetQualifiedCount?: number
  qualificationEvidence: Readonly<Record<string, { qualified: boolean; evidenceRef?: string }>>
  registeredAgents: readonly CosUniversityRegisteredAgent[]
}): SpecialistMeshCoverageDecision {
  const targetQualifiedCount = Math.max(2, Math.min(8, Math.floor(input.targetQualifiedCount ?? 2)))
  const authorized = new Set(input.capability.authorizedAgentIds)
  const qualifiedAll = new Set(
    Object.entries(input.qualificationEvidence)
      .filter(([, decision]) => decision.qualified === true && clean(decision.evidenceRef, 700).length > 0)
      .map(([agentId]) => agentId),
  )
  const qualifiedAuthorizedAgentIds = [...qualifiedAll].filter(agentId => authorized.has(agentId)).sort()
  const qualificationEvidenceRefs = Object.freeze(Object.fromEntries(
    qualifiedAuthorizedAgentIds.map(agentId => [agentId, clean(input.qualificationEvidence[agentId]?.evidenceRef, 700)]),
  ))
  const shortage = Math.max(0, targetQualifiedCount - qualifiedAuthorizedAgentIds.length)

  if (shortage === 0) {
    return Object.freeze({
      capability: input.capability,
      targetQualifiedCount,
      qualifiedAuthorizedAgentIds: Object.freeze(qualifiedAuthorizedAgentIds),
      qualificationEvidenceRefs,
      candidateAgentId: null,
      candidateRole: null,
      candidateAuthorized: null,
      status: 'covered',
      priority: riskPriority(input.capability.risk, 0),
    })
  }

  const roleFit = input.registeredAgents
    .filter(agent => input.capability.eligibleRoles.includes(agent.role))
    .sort((a, b) => a.agentId.localeCompare(b.agentId))

  // A qualified University identity that merely lacks the Production assignment is an authorization
  // gap, not a reason to make it restudy. This path never grants the missing assignment.
  const qualifiedUnauthorized = roleFit.find(agent => qualifiedAll.has(agent.agentId) && !authorized.has(agent.agentId))
  if (qualifiedUnauthorized) {
    return Object.freeze({
      capability: input.capability,
      targetQualifiedCount,
      qualifiedAuthorizedAgentIds: Object.freeze(qualifiedAuthorizedAgentIds),
      qualificationEvidenceRefs,
      candidateAgentId: qualifiedUnauthorized.agentId,
      candidateRole: qualifiedUnauthorized.role,
      candidateAuthorized: false,
      status: 'authorization_gap',
      priority: riskPriority(input.capability.risk, shortage),
    })
  }

  // Prefer an already-authorized learner; otherwise cross-train a role-fit University identity while
  // preserving the explicit fact that a later independent authorization decision is still required.
  const unqualified = roleFit.filter(agent => !qualifiedAll.has(agent.agentId))
  const candidate = unqualified.find(agent => authorized.has(agent.agentId)) ?? unqualified[0]
  if (!candidate) {
    return Object.freeze({
      capability: input.capability,
      targetQualifiedCount,
      qualifiedAuthorizedAgentIds: Object.freeze(qualifiedAuthorizedAgentIds),
      qualificationEvidenceRefs,
      candidateAgentId: null,
      candidateRole: null,
      candidateAuthorized: null,
      status: 'unassigned',
      priority: riskPriority(input.capability.risk, shortage),
    })
  }

  return Object.freeze({
    capability: input.capability,
    targetQualifiedCount,
    qualifiedAuthorizedAgentIds: Object.freeze(qualifiedAuthorizedAgentIds),
    qualificationEvidenceRefs,
    candidateAgentId: candidate.agentId,
    candidateRole: candidate.role,
    candidateAuthorized: authorized.has(candidate.agentId),
    status: 'training_priority',
    priority: riskPriority(input.capability.risk, shortage),
  })
}

async function persistCoverageDecision(
  db: SupabaseClient,
  decision: SpecialistMeshCoverageDecision,
  now: string,
  studyPlanId: string | null,
): Promise<void> {
  const capability = decision.capability
  const covered = decision.status === 'covered'
  const result = await db.from('a2a_specialist_mesh_university_coverage').upsert({
    coverage_key: capability.coverageKey,
    tenant_id: capability.tenantId,
    environment_id: capability.environmentId,
    portable_id: capability.portableId,
    skill_id: capability.skillId,
    risk: capability.risk,
    target_qualified_count: decision.targetQualifiedCount,
    authorized_agent_ids: capability.authorizedAgentIds,
    qualified_authorized_agent_ids: decision.qualifiedAuthorizedAgentIds,
    qualification_evidence_refs: decision.qualificationEvidenceRefs,
    candidate_agent_id: decision.candidateAgentId,
    candidate_role: decision.candidateRole,
    candidate_authorized: decision.candidateAuthorized,
    university_subject_id: capability.subjectId,
    priority: decision.priority,
    status: decision.status,
    ...(studyPlanId ? { study_plan_id: studyPlanId } : {}),
    observed_at: now,
    updated_at: now,
    resolved_at: covered ? now : null,
  }, { onConflict: 'coverage_key' })
  if (result.error) throw result.error
}

async function ensureCoverageStudyPlan(
  db: SupabaseClient,
  decision: SpecialistMeshCoverageDecision,
  now: string,
): Promise<string | null> {
  if (decision.status !== 'training_priority' || !decision.candidateAgentId) return null
  const capability = decision.capability
  const strategy = selectCosUniversityStudyStrategy({ failureClass: 'cross_domain' })
  const planKey = hash(['specialist_mesh_coverage', capability.coverageKey, decision.candidateAgentId])
  const sourceRef = `specialist-mesh-coverage:${capability.coverageKey}`
  const objective = [
    `Cross-train ${decision.candidateAgentId} for the exact Specialist Mesh capability ${capability.skillId}`,
    `in ${capability.tenantId}/${capability.environmentId}/${capability.portableId}.`,
    'Study does not grant runtime authority or specialist qualification; both remain independently governed.',
  ].join(' ')
  const evidence = Object.freeze({
    origin: 'specialist_mesh_university_coverage',
    coverageKey: capability.coverageKey,
    tenantId: capability.tenantId,
    environmentId: capability.environmentId,
    portableId: capability.portableId,
    skillId: capability.skillId,
    risk: capability.risk,
    targetQualifiedCount: decision.targetQualifiedCount,
    qualifiedAuthorizedAgentIds: decision.qualifiedAuthorizedAgentIds,
    qualificationEvidenceRefs: decision.qualificationEvidenceRefs,
    candidateAuthorized: decision.candidateAuthorized,
    runtimeAuthorityGranted: false,
    specialistQualificationGranted: false,
    academicCreditGrantedByAdmission: false,
    learningDesign: strategy.learningDesign,
  })

  const insert = await db.from('cos_university_study_plans').upsert({
    plan_key: planKey,
    agent_id: decision.candidateAgentId,
    subject_id: capability.subjectId,
    language_code: null,
    language_dimension: null,
    failure_class: 'cross_domain',
    target_grade: 'A+',
    source_kind: 'operational_weakness',
    source_ref: sourceRef,
    problem_class: capability.skillId,
    objective,
    methods: strategy.methods,
    acquisition_source_kinds: strategy.acquisitionSourceKinds,
    fine_tune_candidate: strategy.fineTuneCandidate,
    priority: decision.priority,
    status: 'queued',
    evidence,
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: 'plan_key', ignoreDuplicates: true })
  if (insert.error) throw insert.error

  const read = await db.from('cos_university_study_plans').select('id').eq('plan_key', planKey).maybeSingle()
  if (read.error) throw read.error
  return typeof read.data?.id === 'string' ? read.data.id : null
}

/**
 * Bounded Production cycle. It maps every exact configured capability, persists all coverage states,
 * and admits at most one new cross-training plan per run. Education cannot mutate the A2A registry,
 * qualification ledger, credentials, approvals, or provider authority.
 */
export async function runSpecialistMeshUniversityCoverage(options: {
  db: SupabaseClient
  descriptors?: readonly ProductionSpecialistBindingDescriptor[]
  now?: Date
  targetQualifiedCount?: number
  maxNewStudyPlans?: number
}): Promise<SpecialistMeshUniversityCoverageSummary> {
  if (process.env.SPECIALIST_MESH_UNIVERSITY_COVERAGE_ENABLED !== 'true') {
    return Object.freeze({
      version: SPECIALIST_MESH_UNIVERSITY_COVERAGE_VERSION,
      enabled: false,
      configuredCapabilities: 0,
      coveredCapabilities: 0,
      gaps: 0,
      trainingPriorities: 0,
      authorizationGaps: 0,
      unassignedGaps: 0,
      studyPlansCreated: 0,
      decisions: Object.freeze([]),
      errors: Object.freeze([]),
      semantics: 'coverage_priorities_create_education_only_never_authority',
    })
  }

  const now = options.now instanceof Date ? options.now : new Date()
  const descriptors = options.descriptors ?? loadProductionSpecialistBindingDescriptors(process.env)
  const capabilities = buildSpecialistMeshCoverageCapabilities(descriptors)
  const registeredAgents = await listCosUniversityRegisteredAgents(200)
  const productionAdapters = createSupabaseSpecialistMeshProductionAdapters(options.db, { now: () => now })
  const existingResult = await options.db.from('a2a_specialist_mesh_university_coverage')
    .select('coverage_key,candidate_agent_id,study_plan_id')
  if (existingResult.error) throw existingResult.error
  const existing = new Map(((existingResult.data ?? []) as ExistingCoverageRow[]).map(row => [row.coverage_key, row] as const))
  const decisions: SpecialistMeshCoverageDecision[] = []
  const errors: string[] = []

  for (const capability of capabilities) {
    try {
      const evidenceAgentIds = [...new Set([
        ...capability.authorizedAgentIds,
        ...registeredAgents.map(agent => agent.agentId),
      ])]
      const qualificationEvidence = await productionAdapters.qualifications.snapshot({
        tenantId: capability.tenantId,
        environmentId: capability.environmentId,
        portableId: capability.portableId,
        skillId: capability.skillId,
        agentIds: Object.freeze(evidenceAgentIds),
      })
      decisions.push(decideSpecialistMeshUniversityCoverage({
        capability,
        targetQualifiedCount: options.targetQualifiedCount,
        qualificationEvidence,
        registeredAgents,
      }))
    } catch (error) {
      errors.push(`${capability.coverageKey}:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const ordered = decisions.sort((a, b) => b.priority - a.priority || a.capability.coverageKey.localeCompare(b.capability.coverageKey))
  const maxNewStudyPlans = Math.max(0, Math.min(4, Math.floor(options.maxNewStudyPlans ?? 1)))
  let studyPlansCreated = 0

  for (const decision of ordered) {
    try {
      const prior = existing.get(decision.capability.coverageKey)
      let studyPlanId = prior?.study_plan_id ?? null
      const candidateChanged = Boolean(prior?.candidate_agent_id && prior.candidate_agent_id !== decision.candidateAgentId)
      if (candidateChanged) studyPlanId = null
      if (decision.status === 'training_priority' && !studyPlanId && studyPlansCreated < maxNewStudyPlans) {
        studyPlanId = await ensureCoverageStudyPlan(options.db, decision, now.toISOString())
        if (studyPlanId) studyPlansCreated += 1
      }
      await persistCoverageDecision(options.db, decision, now.toISOString(), studyPlanId)
    } catch (error) {
      errors.push(`${decision.capability.coverageKey}:persist:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const coveredCapabilities = ordered.filter(item => item.status === 'covered').length
  const trainingPriorities = ordered.filter(item => item.status === 'training_priority').length
  const authorizationGaps = ordered.filter(item => item.status === 'authorization_gap').length
  const unassignedGaps = ordered.filter(item => item.status === 'unassigned').length
  return Object.freeze({
    version: SPECIALIST_MESH_UNIVERSITY_COVERAGE_VERSION,
    enabled: true,
    configuredCapabilities: ordered.length,
    coveredCapabilities,
    gaps: ordered.length - coveredCapabilities,
    trainingPriorities,
    authorizationGaps,
    unassignedGaps,
    studyPlansCreated,
    decisions: Object.freeze(ordered),
    errors: Object.freeze(errors),
    semantics: 'coverage_priorities_create_education_only_never_authority',
  })
}
