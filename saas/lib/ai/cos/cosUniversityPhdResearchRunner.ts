import { createHash } from 'node:crypto'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import {
  beginEvidenceSourceUseTurn,
  peekEvidenceSourceUseTurnId,
} from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  COS_UNIVERSITY_PHD_PROGRAMS,
  cosUniversityPhdEvidenceEligible,
  cosUniversityPhdExpectedAuthority,
  cosUniversityPhdProgramKey,
  type CosUniversityPhdEvidence,
  type CosUniversityPhdEvidenceStage,
  type CosUniversityPhdProgramId,
} from './cosUniversityPhd.ts'
import {
  cosUniversityPhdActorIdentityEligible,
  readCosUniversityPhdEvidence,
  readCosUniversityPhdRuntimeStatus,
  type CosUniversityPhdActorIdentity,
  type CosUniversityPhdProject,
} from './cosUniversityPhdRuntime.ts'
import {
  cosUniversityPhdResearchWorkAcademicCredit,
  decideNextCosUniversityPhdCandidateResearch,
  type CosUniversityPhdResearchAcademicStage,
  type CosUniversityPhdResearchRunState,
  type CosUniversityPhdResearchWorkKind,
} from './cosUniversityPhdResearchPolicy.ts'

const AGENT_ID = 'cos'
const CLAIM_TTL_MS = 15 * 60_000
const MAX_PRODUCT_CHARS = 24_000
const MAX_PRIOR_CONTEXT_CHARS = 9_000
const DEFAULT_WORK_WINDOW_MS = 7 * 86_400_000

const RESEARCH_CHAIN: readonly CosUniversityPhdResearchAcademicStage[] = Object.freeze([
  'primary_literature_synthesis',
  'hypothesis_proposal',
  'preregistered_experiment',
  'independent_replication',
  'peer_critique_defense',
  'dissertation_defense',
])

const RESEARCH_STAGE_ORDER: readonly CosUniversityPhdResearchAcademicStage[] = Object.freeze([
  'research_methodology_exam',
  ...RESEARCH_CHAIN,
])

const CRITICAL_INDEPENDENCE_STAGES: readonly CosUniversityPhdResearchAcademicStage[] = Object.freeze([
  'preregistered_experiment',
  'independent_replication',
  'peer_critique_defense',
  'dissertation_defense',
])

const WORK_STAGE: Readonly<Record<CosUniversityPhdResearchWorkKind, CosUniversityPhdResearchAcademicStage>> = Object.freeze({
  primary_literature_research: 'primary_literature_synthesis',
  hypothesis_development: 'hypothesis_proposal',
  experiment_protocol_design: 'preregistered_experiment',
  independent_replication: 'independent_replication',
  peer_review: 'peer_critique_defense',
  peer_critique_response: 'peer_critique_defense',
  dissertation_synthesis: 'dissertation_defense',
  dissertation_review: 'dissertation_defense',
})

const AUTO_CANDIDATE_WORK = new Set<CosUniversityPhdResearchWorkKind>([
  'primary_literature_research',
  'hypothesis_development',
  'experiment_protocol_design',
  'peer_critique_response',
  'dissertation_synthesis',
])

type AssignmentRow = {
  assignment_key: string
  program_id: CosUniversityPhdProgramId
  research_project_id: string
  protocol_id: string
  candidate_actor_id: string
  performer_actor_id: string
  work_kind: CosUniversityPhdResearchWorkKind
  academic_stage: CosUniversityPhdResearchAcademicStage
  attempt_index: number
  parent_evidence_ids: string[]
  objective: string
  objective_hash: string
  source_ref: string
  assigned_at: string
  not_after: string
}

type RunRow = {
  run_key: string
  assignment_key: string
  status: 'created' | 'running' | 'submitted' | 'failed'
  failure_reason: string | null
  started_at: string | null
  claim_expires_at: string | null
  completed_at: string | null
  turn_id: string | null
  response_source: string | null
  local_model_invoked: boolean | null
  external_ai_invoked: boolean | null
  semantic_cache: boolean | null
}

type ProductRow = {
  product_key: string
  assignment_key: string
  actor_id: string
  content_text: string
  content_hash: string
  source_ref: string
  submitted_at: string
  academic_credit: false
}

type ActorRow = {
  actor_id: string
  actor_role: CosUniversityPhdActorIdentity['actorRole']
  principal_type: CosUniversityPhdActorIdentity['principalType']
  principal_fingerprint: string
  source_ref: string
  valid_from: string
  valid_until: string
}

export type CosUniversityPhdResearchAssignment = Readonly<{
  assignmentKey: string
  programId: CosUniversityPhdProgramId
  researchProjectId: string
  protocolId: string
  candidateActorId: string
  performerActorId: string
  workKind: CosUniversityPhdResearchWorkKind
  academicStage: CosUniversityPhdResearchAcademicStage
  attemptIndex: number
  parentEvidenceIds: readonly string[]
  objective: string
  objectiveHash: string
  sourceRef: string
  assignedAt: string
  notAfter: string
  academicCredit: false
}>

export type CosUniversityPhdResearchRun = Readonly<{
  runKey: string
  assignmentKey: string
  status: RunRow['status']
  failureReason: string | null
  startedAt: string | null
  claimExpiresAt: string | null
  completedAt: string | null
  turnId: string | null
  responseSource: string | null
  localModelInvoked: boolean | null
  externalAiInvoked: boolean | null
  semanticCache: boolean | null
}>

export type CosUniversityPhdResearchProduct = Readonly<{
  productKey: string
  assignmentKey: string
  actorId: string
  contentText: string
  contentHash: string
  sourceRef: string
  submittedAt: string
  academicCredit: false
}>

export type CosUniversityPhdResearchWorkRecord = Readonly<{
  assignment: CosUniversityPhdResearchAssignment
  run: CosUniversityPhdResearchRun | null
  product: CosUniversityPhdResearchProduct | null
}>

export type CosUniversityPhdResearchCycleSummary = Readonly<{
  enabled: boolean
  programId: CosUniversityPhdProgramId | null
  assignmentKey: string | null
  workKind: CosUniversityPhdResearchWorkKind | null
  status:
    | 'disabled'
    | 'not_enrolled'
    | 'program_inactive'
    | 'research_project_required'
    | 'ambiguous_research_lineage'
    | 'independent_boundary'
    | 'awaiting_independent_evaluation'
    | 'work_active'
    | 'submitted'
    | 'failed'
    | 'not_claimed'
    | 'no_candidate_work'
    | 'error'
  reason: string
  academicCredit: false
  turnId: string | null
  contentHash: string | null
}>

type IntegrityRepairContext = Readonly<{
  stage: CosUniversityPhdResearchAcademicStage | null
  allowedParentEvidenceIds: readonly string[] | null
  requiresCandidateWork: boolean
}>

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function dbOrThrow() {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  return db
}

function mapAssignment(row: AssignmentRow): CosUniversityPhdResearchAssignment {
  return {
    assignmentKey: row.assignment_key,
    programId: row.program_id,
    researchProjectId: row.research_project_id,
    protocolId: row.protocol_id,
    candidateActorId: row.candidate_actor_id,
    performerActorId: row.performer_actor_id,
    workKind: row.work_kind,
    academicStage: row.academic_stage,
    attemptIndex: row.attempt_index,
    parentEvidenceIds: row.parent_evidence_ids || [],
    objective: row.objective,
    objectiveHash: row.objective_hash,
    sourceRef: row.source_ref,
    assignedAt: row.assigned_at,
    notAfter: row.not_after,
    academicCredit: false,
  }
}

function mapRun(row: RunRow | null): CosUniversityPhdResearchRun | null {
  if (!row) return null
  return {
    runKey: row.run_key,
    assignmentKey: row.assignment_key,
    status: row.status,
    failureReason: row.failure_reason,
    startedAt: row.started_at,
    claimExpiresAt: row.claim_expires_at,
    completedAt: row.completed_at,
    turnId: row.turn_id,
    responseSource: row.response_source,
    localModelInvoked: row.local_model_invoked,
    externalAiInvoked: row.external_ai_invoked,
    semanticCache: row.semantic_cache,
  }
}

function mapProduct(row: ProductRow | null): CosUniversityPhdResearchProduct | null {
  if (!row) return null
  return {
    productKey: row.product_key,
    assignmentKey: row.assignment_key,
    actorId: row.actor_id,
    contentText: row.content_text,
    contentHash: row.content_hash,
    sourceRef: row.source_ref,
    submittedAt: row.submitted_at,
    academicCredit: false,
  }
}

function mapActor(row: ActorRow | null): CosUniversityPhdActorIdentity | null {
  if (!row) return null
  return {
    actorId: row.actor_id,
    actorRole: row.actor_role,
    principalType: row.principal_type,
    principalFingerprint: row.principal_fingerprint,
    sourceRef: row.source_ref,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  }
}

async function loadCandidateIdentity(actorId: string): Promise<CosUniversityPhdActorIdentity | null> {
  const result = await dbOrThrow().from('cos_university_phd_actor_identities')
    .select('actor_id,actor_role,principal_type,principal_fingerprint,source_ref,valid_from,valid_until')
    .eq('actor_id', clean(actorId, 300))
    .maybeSingle()
  if (result.error) throw result.error
  return mapActor((result.data || null) as ActorRow | null)
}

async function loadActorIdentities(actorIds: readonly string[]): Promise<Map<string, CosUniversityPhdActorIdentity>> {
  const ids = [...new Set(actorIds.map(id => clean(id, 300)).filter(Boolean))]
  if (!ids.length) return new Map()
  const result = await dbOrThrow().from('cos_university_phd_actor_identities')
    .select('actor_id,actor_role,principal_type,principal_fingerprint,source_ref,valid_from,valid_until')
    .in('actor_id', ids)
  if (result.error) throw result.error
  const rows = ((result.data || []) as ActorRow[])
    .map(row => mapActor(row))
    .filter((row): row is CosUniversityPhdActorIdentity => Boolean(row))
  return new Map(rows.map(row => [row.actorId, row]))
}

async function loadAssignments(programId: CosUniversityPhdProgramId): Promise<CosUniversityPhdResearchAssignment[]> {
  const result = await dbOrThrow().from('cos_university_phd_work_assignments')
    .select('assignment_key,program_id,research_project_id,protocol_id,candidate_actor_id,performer_actor_id,work_kind,academic_stage,attempt_index,parent_evidence_ids,objective,objective_hash,source_ref,assigned_at,not_after')
    .eq('agent_id', AGENT_ID)
    .eq('program_key', cosUniversityPhdProgramKey(programId))
    .order('assigned_at', { ascending: true })
  if (result.error) throw result.error
  return ((result.data || []) as AssignmentRow[]).map(mapAssignment)
}

async function loadRuns(assignmentKeys: readonly string[]): Promise<Map<string, CosUniversityPhdResearchRun>> {
  if (!assignmentKeys.length) return new Map()
  const result = await dbOrThrow().from('cos_university_phd_work_runs')
    .select('run_key,assignment_key,status,failure_reason,started_at,claim_expires_at,completed_at,turn_id,response_source,local_model_invoked,external_ai_invoked,semantic_cache')
    .in('assignment_key', [...assignmentKeys])
  if (result.error) throw result.error
  return new Map(((result.data || []) as RunRow[]).map(row => [row.assignment_key, mapRun(row)!]))
}

async function loadProducts(assignmentKeys: readonly string[]): Promise<Map<string, CosUniversityPhdResearchProduct>> {
  if (!assignmentKeys.length) return new Map()
  const result = await dbOrThrow().from('cos_university_phd_work_products')
    .select('product_key,assignment_key,actor_id,content_text,content_hash,source_ref,submitted_at,academic_credit')
    .in('assignment_key', [...assignmentKeys])
  if (result.error) throw result.error
  return new Map(((result.data || []) as ProductRow[]).map(row => [row.assignment_key, mapProduct(row)!]))
}

export async function readCosUniversityPhdResearchWork(
  programId: CosUniversityPhdProgramId,
): Promise<CosUniversityPhdResearchWorkRecord[]> {
  const assignments = await loadAssignments(programId)
  const keys = assignments.map(row => row.assignmentKey)
  const [runs, products] = await Promise.all([loadRuns(keys), loadProducts(keys)])
  return assignments.map(assignment => ({
    assignment,
    run: runs.get(assignment.assignmentKey) ?? null,
    product: products.get(assignment.assignmentKey) ?? null,
  }))
}

function projectMatches(
  project: CosUniversityPhdProject,
  candidateActorId: string,
  researchProjectId: string,
  protocolId: string,
): boolean {
  return project.candidateActorId === candidateActorId
    && project.researchProjectId === researchProjectId
    && project.protocolId === protocolId
}

function parentStageForWork(workKind: CosUniversityPhdResearchWorkKind): CosUniversityPhdEvidenceStage | null {
  if (workKind === 'hypothesis_development') return 'primary_literature_synthesis'
  if (workKind === 'experiment_protocol_design') return 'hypothesis_proposal'
  if (workKind === 'independent_replication') return 'preregistered_experiment'
  if (workKind === 'peer_review' || workKind === 'peer_critique_response') return 'independent_replication'
  if (workKind === 'dissertation_synthesis' || workKind === 'dissertation_review') return 'peer_critique_defense'
  return null
}

function previousStage(stage: CosUniversityPhdResearchAcademicStage): CosUniversityPhdResearchAcademicStage | null {
  const index = RESEARCH_CHAIN.indexOf(stage)
  return index > 0 ? RESEARCH_CHAIN[index - 1] : null
}

function normalizedDistinctIds(values: readonly string[] | undefined): { valid: boolean; ids: string[] } {
  if (!Array.isArray(values)) return { valid: false, ids: [] }
  const ids = values.map(value => clean(value, 300))
  if (ids.some(value => !value)) return { valid: false, ids: [] }
  if (new Set(ids).size !== ids.length) return { valid: false, ids: [] }
  return { valid: true, ids }
}

function failureResetEligibleForResearch(row: CosUniversityPhdEvidence, now: Date): boolean {
  if (row.passed) return false
  const observedAt = Date.parse(row.observedAt)
  const validUntil = Date.parse(row.validUntil)
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(observedAt) || !Number.isFinite(validUntil)) return false
  if (observedAt > now.getTime() || validUntil <= observedAt) return false
  if (!clean(row.variantHash, 1000) || !clean(row.evidenceId, 300) || !clean(row.candidateActorId, 300)
    || !clean(row.researchProjectId, 300) || !clean(row.protocolId, 300)) return false
  if (row.identityProvenance !== 'host_identity_ledger' || !row.independent) return false
  if (row.authority !== cosUniversityPhdExpectedAuthority(row.stage)) return false

  const performers = normalizedDistinctIds(row.performerActorIds)
  const evaluators = normalizedDistinctIds(row.evaluatorActorIds)
  if (!performers.valid || !evaluators.valid || !performers.ids.length) return false
  const minimumEvaluators = row.stage === 'research_methodology_exam' || row.stage === 'preregistered_experiment' ? 1 : 2
  if (evaluators.ids.length < minimumEvaluators) return false
  const candidate = clean(row.candidateActorId, 300)
  const evaluatorSet = new Set(evaluators.ids)
  if (evaluatorSet.has(candidate) || performers.ids.some(actorId => evaluatorSet.has(actorId))) return false
  if (row.stage === 'independent_replication') {
    if (performers.ids.includes(candidate)) return false
  } else if (!performers.ids.includes(candidate)) return false
  return true
}

function currentEligibleStagePasses(
  evidence: readonly CosUniversityPhdEvidence[],
  stage: CosUniversityPhdEvidenceStage,
  now: Date,
): CosUniversityPhdEvidence[] {
  const rows = evidence
    .filter(row => row.stage === stage)
    .filter(row => row.passed
      ? cosUniversityPhdEvidenceEligible(row, now)
      : failureResetEligibleForResearch(row, now))
    .slice()
    .sort((left, right) => {
      const delta = Date.parse(left.observedAt) - Date.parse(right.observedAt)
      if (delta !== 0) return delta
      if (left.passed !== right.passed) return left.passed ? -1 : 1
      return clean(left.evidenceId, 300).localeCompare(clean(right.evidenceId, 300))
    })
  let variants = new Map<string, CosUniversityPhdEvidence>()
  for (const row of rows) {
    if (!row.passed) {
      variants = new Map()
      continue
    }
    variants.set(row.variantHash, row)
  }
  return [...variants.values()]
}

function integrityRepairStage(
  evidence: readonly CosUniversityPhdEvidence[],
  blockers: readonly string[],
  now: Date,
): CosUniversityPhdResearchAcademicStage | null {
  const current = new Map<CosUniversityPhdResearchAcademicStage, CosUniversityPhdEvidence[]>()
  for (const stage of RESEARCH_STAGE_ORDER) current.set(stage, currentEligibleStagePasses(evidence, stage, now))

  if (blockers.includes('research_evidence_identity_collision')) {
    const seen = new Map<string, CosUniversityPhdResearchAcademicStage>()
    for (const stage of RESEARCH_STAGE_ORDER) {
      for (const row of current.get(stage) || []) {
        const evidenceId = clean(row.evidenceId, 300)
        if (seen.has(evidenceId)) return stage
        seen.set(evidenceId, stage)
      }
    }
  }

  if (blockers.includes('research_lineage_link_failed') || blockers.includes('research_replication_target_mismatch')) {
    for (let index = 1; index < RESEARCH_CHAIN.length; index += 1) {
      const stage = RESEARCH_CHAIN[index]
      const previousStage = RESEARCH_CHAIN[index - 1]
      const previousById = new Map((current.get(previousStage) || []).map(row => [clean(row.evidenceId, 300), row]))
      for (const row of current.get(stage) || []) {
        const linked = (row.parentEvidenceIds || [])
          .map(id => previousById.get(clean(id, 300)))
          .filter((parent): parent is CosUniversityPhdEvidence => Boolean(parent))
          .filter(parent => Date.parse(parent.observedAt) < Date.parse(row.observedAt))
        if (!linked.length) return stage
        if (stage === 'independent_replication') {
          const target = clean(row.replicatedArtifactHash, 1000)
          if (!target || !linked.some(parent => clean(parent.reproducibleArtifactHash, 1000) === target)) return stage
        }
      }
    }
  }

  if (blockers.includes('research_independence_separation_failed')) {
    const pools = new Map<CosUniversityPhdResearchAcademicStage, Set<string>>()
    for (const stage of CRITICAL_INDEPENDENCE_STAGES) {
      const actors = new Set<string>()
      for (const row of current.get(stage) || []) {
        for (const actorId of row.evaluatorActorIds) actors.add(clean(actorId, 300))
        if (stage === 'preregistered_experiment') {
          for (const actorId of row.performerActorIds) {
            const normalized = clean(actorId, 300)
            if (normalized && normalized !== clean(row.candidateActorId, 300)) actors.add(normalized)
          }
        }
        if (stage === 'independent_replication') {
          for (const actorId of row.performerActorIds) actors.add(clean(actorId, 300))
        }
      }
      pools.set(stage, actors)
    }
    for (let left = 0; left < CRITICAL_INDEPENDENCE_STAGES.length; left += 1) {
      for (let right = left + 1; right < CRITICAL_INDEPENDENCE_STAGES.length; right += 1) {
        const leftActors = pools.get(CRITICAL_INDEPENDENCE_STAGES[left]) || new Set<string>()
        const rightActors = pools.get(CRITICAL_INDEPENDENCE_STAGES[right]) || new Set<string>()
        if ([...leftActors].some(actorId => actorId && rightActors.has(actorId))) {
          return CRITICAL_INDEPENDENCE_STAGES[right]
        }
      }
    }
  }
  return null
}

async function principalIndependenceRepairStage(
  evidence: readonly CosUniversityPhdEvidence[],
  reasons: readonly string[],
  now: Date,
): Promise<CosUniversityPhdResearchAcademicStage | null> {
  if (!reasons.length) return null
  const relevant = reasons.some(reason => [
    'phd_actor_identity_unresolved',
    'phd_candidate_principal_unresolved',
    'phd_actor_principal_unresolved',
    'phd_candidate_principal_not_independent',
    'phd_principal_independence_separation_failed',
  ].includes(reason))
  if (!relevant) return null

  const current = new Map<CosUniversityPhdResearchAcademicStage, CosUniversityPhdEvidence[]>()
  for (const stage of CRITICAL_INDEPENDENCE_STAGES) current.set(stage, currentEligibleStagePasses(evidence, stage, now))
  const rows = CRITICAL_INDEPENDENCE_STAGES.flatMap(stage => current.get(stage) || [])
  if (!rows.length) return null
  const actorIds = [...new Set(rows.flatMap(row => [row.candidateActorId, ...row.performerActorIds, ...row.evaluatorActorIds]))]
  const identities = await loadActorIdentities(actorIds)
  const candidateId = clean(rows[0].candidateActorId, 300)
  const candidatePrincipal = identities.get(candidateId)?.principalFingerprint || null

  const pools = new Map<CosUniversityPhdResearchAcademicStage, Set<string>>()
  for (const stage of CRITICAL_INDEPENDENCE_STAGES) {
    const pool = new Set<string>()
    for (const row of current.get(stage) || []) {
      const observedAt = new Date(row.observedAt)
      const actorPool = [
        ...row.evaluatorActorIds,
        ...(stage === 'preregistered_experiment'
          ? row.performerActorIds.filter(actorId => clean(actorId, 300) !== clean(row.candidateActorId, 300))
          : []),
        ...(stage === 'independent_replication' ? row.performerActorIds : []),
      ]
      for (const actorId of actorPool) {
        const identity = identities.get(clean(actorId, 300))
        if (!identity || !cosUniversityPhdActorIdentityEligible(identity, observedAt)) return stage
        if (!clean(identity.principalFingerprint, 500)) return stage
        if (candidatePrincipal && identity.principalFingerprint === candidatePrincipal) return stage
        pool.add(identity.principalFingerprint)
      }
    }
    pools.set(stage, pool)
  }

  for (let left = 0; left < CRITICAL_INDEPENDENCE_STAGES.length; left += 1) {
    for (let right = left + 1; right < CRITICAL_INDEPENDENCE_STAGES.length; right += 1) {
      const leftPool = pools.get(CRITICAL_INDEPENDENCE_STAGES[left]) || new Set<string>()
      const rightPool = pools.get(CRITICAL_INDEPENDENCE_STAGES[right]) || new Set<string>()
      if ([...leftPool].some(principal => rightPool.has(principal))) return CRITICAL_INDEPENDENCE_STAGES[right]
    }
  }
  return null
}

function integrityRepairContext(
  evidence: readonly CosUniversityPhdEvidence[],
  blockers: readonly string[],
  now: Date,
  principalRepairStage: CosUniversityPhdResearchAcademicStage | null = null,
): IntegrityRepairContext {
  const stage = integrityRepairStage(evidence, blockers, now) ?? principalRepairStage
  if (!stage) return { stage: null, allowedParentEvidenceIds: null, requiresCandidateWork: false }
  const previous = previousStage(stage)
  const allowedParentEvidenceIds = previous
    ? currentEligibleStagePasses(evidence, previous, now).map(row => row.evidenceId)
    : null
  const independenceFailure = blockers.includes('research_independence_separation_failed')
    || blockers.includes('phd_candidate_principal_not_independent')
    || blockers.includes('phd_principal_independence_separation_failed')
    || blockers.includes('phd_actor_identity_unresolved')
    || blockers.includes('phd_actor_principal_unresolved')
    || blockers.includes('phd_candidate_principal_unresolved')
  const requiresCandidateWork = !independenceFailure
    && (stage === 'primary_literature_synthesis'
      || stage === 'hypothesis_proposal'
      || stage === 'preregistered_experiment'
      || stage === 'dissertation_defense')
  return { stage, allowedParentEvidenceIds, requiresCandidateWork }
}

function objectiveForWork(
  workKind: CosUniversityPhdResearchWorkKind,
  programTitle: string,
  projectObjective: string,
): string {
  const project = clean(projectObjective, 2500)
  if (workKind === 'primary_literature_research') return `Build a critical primary-literature research synthesis for ${programTitle}. Research objective: ${project}`
  if (workKind === 'hypothesis_development') return `Develop falsifiable research hypotheses and discriminating tests for ${programTitle}. Research objective: ${project}`
  if (workKind === 'experiment_protocol_design') return `Design a preregistration-ready experimental protocol without claiming the experiment was run. Research objective: ${project}`
  if (workKind === 'peer_critique_response') return `Respond to independent peer criticism with evidence-bounded corrections and unresolved limitations. Research objective: ${project}`
  return `Synthesize the coherent research lineage into a dissertation-quality argument while preserving uncertainty. Research objective: ${project}`
}

async function ensureRun(assignmentKey: string): Promise<void> {
  const result = await dbOrThrow().from('cos_university_phd_work_runs').insert({
    run_key: digest(`phd-work-run|${assignmentKey}`),
    assignment_key: assignmentKey,
    status: 'created',
  })
  if (result.error && String((result.error as { code?: string }).code || '') !== '23505') throw result.error
}

async function failUnclaimedAssignment(assignmentKey: string, reason: string, now: Date): Promise<void> {
  const result = await dbOrThrow().from('cos_university_phd_work_runs').update({
    status: 'failed',
    failure_reason: clean(reason, 1000),
    completed_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('assignment_key', assignmentKey).eq('status', 'created')
  if (result.error) throw result.error
}

async function createCandidateAssignment(input: {
  programId: CosUniversityPhdProgramId
  project: CosUniversityPhdProject
  workKind: CosUniversityPhdResearchWorkKind
  attemptIndex: number
  evidence: readonly CosUniversityPhdEvidence[]
  now: Date
  programTitle: string
}): Promise<CosUniversityPhdResearchAssignment | null> {
  if (!AUTO_CANDIDATE_WORK.has(input.workKind)) return null
  const status = await readCosUniversityPhdRuntimeStatus(input.programId, input.now)
  if (!status.enrollment || status.credential || status.timingStatus === 'deadline_expired' || status.timingStatus === 'not_enrolled') return null
  if (!status.projects.some(project => projectMatches(project, input.project.candidateActorId, input.project.researchProjectId, input.project.protocolId))) return null

  const candidate = await loadCandidateIdentity(input.project.candidateActorId)
  if (!candidate
    || candidate.actorRole !== 'candidate'
    || candidate.principalType !== 'ai_model'
    || !cosUniversityPhdActorIdentityEligible(candidate, input.now)) return null

  const parentStage = parentStageForWork(input.workKind)
  const parentRows = parentStage ? currentEligibleStagePasses(input.evidence, parentStage, input.now) : []
  if (parentStage && !parentRows.length) return null
  if (parentRows.some(row => Date.parse(row.observedAt) >= input.now.getTime())) return null
  const parentEvidenceIds = parentRows.map(row => row.evidenceId)
  const objective = objectiveForWork(input.workKind, input.programTitle, input.project.researchObjective)
  const objectiveHash = digest(objective)
  const academicStage = WORK_STAGE[input.workKind]
  const attemptIndex = Math.max(0, Math.floor(input.attemptIndex))
  const assignmentKey = digest([
    AGENT_ID,
    input.programId,
    input.project.researchProjectId,
    input.project.protocolId,
    input.project.candidateActorId,
    input.workKind,
    academicStage,
    String(attemptIndex),
    objectiveHash,
    parentEvidenceIds.join(','),
  ].join('|'))
  const notAfter = new Date(Math.min(Date.parse(status.enrollment.hardDeadlineAt), input.now.getTime() + DEFAULT_WORK_WINDOW_MS))
  if (notAfter.getTime() <= input.now.getTime()) return null

  const db = dbOrThrow()
  const select = 'assignment_key,program_id,research_project_id,protocol_id,candidate_actor_id,performer_actor_id,work_kind,academic_stage,attempt_index,parent_evidence_ids,objective,objective_hash,source_ref,assigned_at,not_after'
  const insert = await db.from('cos_university_phd_work_assignments').insert({
    assignment_key: assignmentKey,
    agent_id: AGENT_ID,
    program_key: status.programKey,
    program_id: input.programId,
    research_project_id: input.project.researchProjectId,
    protocol_id: input.project.protocolId,
    candidate_actor_id: input.project.candidateActorId,
    performer_actor_id: input.project.candidateActorId,
    work_kind: input.workKind,
    academic_stage: academicStage,
    attempt_index: attemptIndex,
    parent_evidence_ids: parentEvidenceIds,
    objective,
    objective_hash: objectiveHash,
    source_ref: `host_phd_research_scheduler:${input.project.projectKey}`,
    assigned_at: input.now.toISOString(),
    not_after: notAfter.toISOString(),
  }).select(select).maybeSingle()

  let assignment: CosUniversityPhdResearchAssignment | null = null
  if (!insert.error && insert.data) {
    assignment = mapAssignment(insert.data as AssignmentRow)
  } else if (insert.error && String((insert.error as { code?: string }).code || '') === '23505') {
    const existing = await db.from('cos_university_phd_work_assignments').select(select)
      .eq('agent_id', AGENT_ID)
      .eq('program_key', status.programKey)
      .eq('research_project_id', input.project.researchProjectId)
      .eq('protocol_id', input.project.protocolId)
      .eq('work_kind', input.workKind)
      .eq('attempt_index', attemptIndex)
      .maybeSingle()
    if (existing.error) throw existing.error
    const row = (existing.data || null) as AssignmentRow | null
    if (!row) return null
    await ensureRun(row.assignment_key)
    if (Date.parse(row.not_after) <= input.now.getTime()) {
      await failUnclaimedAssignment(row.assignment_key, 'expired_research_assignment_recovered', input.now)
      return null
    }
    if (row.assignment_key !== assignmentKey) {
      await failUnclaimedAssignment(row.assignment_key, 'assignment_context_superseded_before_claim', input.now)
      return null
    }
    assignment = mapAssignment(row)
  } else if (insert.error) {
    throw insert.error
  }

  if (!assignment) return null
  await ensureRun(assignment.assignmentKey)
  return assignment
}

async function loadRunForAssignment(assignmentKey: string): Promise<CosUniversityPhdResearchRun | null> {
  const result = await dbOrThrow().from('cos_university_phd_work_runs')
    .select('run_key,assignment_key,status,failure_reason,started_at,claim_expires_at,completed_at,turn_id,response_source,local_model_invoked,external_ai_invoked,semantic_cache')
    .eq('assignment_key', assignmentKey)
    .maybeSingle()
  if (result.error) throw result.error
  return mapRun((result.data || null) as RunRow | null)
}

async function claimCandidateAssignment(assignment: CosUniversityPhdResearchAssignment, now: Date): Promise<boolean> {
  if (assignment.performerActorId !== assignment.candidateActorId || Date.parse(assignment.notAfter) <= now.getTime()) return false
  const run = await loadRunForAssignment(assignment.assignmentKey)
  if (!run || run.status !== 'created') return false
  const result = await dbOrThrow().from('cos_university_phd_work_runs').update({
    status: 'running',
    started_at: now.toISOString(),
    claim_expires_at: new Date(now.getTime() + CLAIM_TTL_MS).toISOString(),
    updated_at: now.toISOString(),
  }).eq('assignment_key', assignment.assignmentKey).eq('status', 'created').select('assignment_key').maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data?.assignment_key)
}

async function failCandidateAssignment(assignment: CosUniversityPhdResearchAssignment, reason: string, now = new Date()): Promise<void> {
  const result = await dbOrThrow().from('cos_university_phd_work_runs').update({
    status: 'failed',
    failure_reason: clean(reason, 1000),
    completed_at: now.toISOString(),
    claim_expires_at: null,
    updated_at: now.toISOString(),
  }).eq('assignment_key', assignment.assignmentKey).eq('status', 'running')
  if (result.error) throw result.error
}

async function persistCandidateProduct(input: {
  assignment: CosUniversityPhdResearchAssignment
  contentText: string
  sourceRef: string
  submittedAt: Date
  turnId: string
  responseSource: string
  localModelInvoked: boolean
  externalAiInvoked: boolean
  semanticCache: boolean
}): Promise<CosUniversityPhdResearchProduct | null> {
  const contentText = String(input.contentText || '').trim().slice(0, MAX_PRODUCT_CHARS)
  if (!contentText || input.assignment.performerActorId !== input.assignment.candidateActorId) return null
  if (input.submittedAt.getTime() < Date.parse(input.assignment.assignedAt)
    || input.submittedAt.getTime() > Date.parse(input.assignment.notAfter)) return null
  const contentHash = digest(contentText)
  const productKey = digest(`phd-work-product|${input.assignment.assignmentKey}|${input.assignment.candidateActorId}|${contentHash}`)
  const sourceRef = clean(input.sourceRef, 1000)
  const submit = await dbOrThrow().rpc('cos_university_phd_submit_work_product', {
    p_assignment_key: input.assignment.assignmentKey,
    p_product_key: productKey,
    p_actor_id: input.assignment.candidateActorId,
    p_content_text: contentText,
    p_content_hash: contentHash,
    p_source_ref: sourceRef,
    p_submitted_at: input.submittedAt.toISOString(),
    p_turn_id: input.turnId,
    p_response_source: input.responseSource,
    p_local_model_invoked: input.localModelInvoked,
    p_external_ai_invoked: input.externalAiInvoked,
    p_semantic_cache: input.semanticCache,
  })
  if (submit.error) throw submit.error
  if (submit.data !== true) return null
  return {
    productKey,
    assignmentKey: input.assignment.assignmentKey,
    actorId: input.assignment.candidateActorId,
    contentText,
    contentHash,
    sourceRef,
    submittedAt: input.submittedAt.toISOString(),
    academicCredit: false,
  }
}

async function recoverResearchRuns(programId: CosUniversityPhdProgramId, now: Date): Promise<void> {
  let records = await readCosUniversityPhdResearchWork(programId)
  for (const record of records.filter(item => !item.run)) await ensureRun(record.assignment.assignmentKey)
  if (records.some(item => !item.run)) records = await readCosUniversityPhdResearchWork(programId)

  const productOrphans = records.filter(record => record.product && record.run && record.run.status !== 'submitted')
  const db = dbOrThrow()
  for (const record of productOrphans) {
    const result = await db.from('cos_university_phd_work_runs').update({
      status: 'submitted',
      completed_at: record.product!.submittedAt,
      claim_expires_at: null,
      updated_at: now.toISOString(),
    }).eq('assignment_key', record.assignment.assignmentKey).in('status', ['created', 'running'])
    if (result.error) throw result.error
  }

  const expiredCreatedKeys = records
    .filter(record => record.run?.status === 'created'
      && Date.parse(record.assignment.notAfter) <= now.getTime())
    .map(record => record.assignment.assignmentKey)
  if (expiredCreatedKeys.length) {
    const expired = await db.from('cos_university_phd_work_runs').update({
      status: 'failed',
      failure_reason: 'expired_research_assignment_recovered',
      completed_at: now.toISOString(),
      claim_expires_at: null,
      updated_at: now.toISOString(),
    }).in('assignment_key', expiredCreatedKeys).eq('status', 'created')
    if (expired.error) throw expired.error
  }

  const staleKeys = records
    .filter(record => record.run?.status === 'running'
      && !record.product
      && record.run.claimExpiresAt
      && Date.parse(record.run.claimExpiresAt) <= now.getTime())
    .map(record => record.assignment.assignmentKey)
  if (!staleKeys.length) return
  const result = await db.from('cos_university_phd_work_runs').update({
    status: 'failed',
    failure_reason: 'stale_research_claim_recovered',
    completed_at: now.toISOString(),
    claim_expires_at: null,
    updated_at: now.toISOString(),
  }).in('assignment_key', staleKeys).eq('status', 'running')
  if (result.error) throw result.error
}

function policyRuns(records: readonly CosUniversityPhdResearchWorkRecord[]): CosUniversityPhdResearchRunState[] {
  return records.flatMap(record => record.run ? [{
    workKind: record.assignment.workKind,
    attemptIndex: record.assignment.attemptIndex,
    status: record.run.status,
    completedAt: record.run.completedAt,
    parentEvidenceIds: record.assignment.parentEvidenceIds,
  }] : [])
}

async function ensureNextCandidateAssignment(
  programId: CosUniversityPhdProgramId,
  now: Date,
): Promise<{ assignment: CosUniversityPhdResearchAssignment | null; reason: string; workKind: CosUniversityPhdResearchWorkKind | null }> {
  await recoverResearchRuns(programId, now)
  const status = await readCosUniversityPhdRuntimeStatus(programId, now)
  if (!status.enrollment) return { assignment: null, reason: 'not_enrolled', workKind: null }
  if (status.credential || status.timingStatus === 'deadline_expired') return { assignment: null, reason: 'program_inactive', workKind: null }
  if (!status.projects.length) return { assignment: null, reason: 'research_project_required', workKind: null }
  if (status.projects.length !== 1) return { assignment: null, reason: 'ambiguous_research_lineage', workKind: null }

  const project = status.projects[0]
  const [records, allEvidence] = await Promise.all([
    readCosUniversityPhdResearchWork(programId),
    readCosUniversityPhdEvidence(programId),
  ])
  const evidence = allEvidence.filter(row => row.researchProjectId === project.researchProjectId
    && row.protocolId === project.protocolId
    && row.candidateActorId === project.candidateActorId)
  const lineageRecords = records.filter(record => record.assignment.researchProjectId === project.researchProjectId
    && record.assignment.protocolId === project.protocolId
    && record.assignment.candidateActorId === project.candidateActorId)
  const principalRepair = await principalIndependenceRepairStage(evidence, status.principalIndependence.reasons, now)
  const combinedBlockers = [...new Set([...status.graduation.blockers, ...status.principalIndependence.reasons])]
  const repair = integrityRepairContext(evidence, combinedBlockers, now, principalRepair)
  const decision = decideNextCosUniversityPhdCandidateResearch({
    graduationBlockers: combinedBlockers,
    runs: policyRuns(lineageRecords),
    evidence: evidence.map(row => ({ stage: row.stage, passed: row.passed, observedAt: row.observedAt })),
    integrityRepairStage: repair.stage,
    integrityRepairAllowedParentEvidenceIds: repair.allowedParentEvidenceIds,
    integrityRepairRequiresCandidateWork: repair.requiresCandidateWork,
  })

  if (!decision.workKind || decision.attemptIndex === null) {
    return { assignment: null, reason: decision.reason, workKind: decision.workKind }
  }
  if (!AUTO_CANDIDATE_WORK.has(decision.workKind)) {
    return { assignment: null, reason: 'independent_boundary', workKind: decision.workKind }
  }
  const assignment = await createCandidateAssignment({
    programId,
    project,
    workKind: decision.workKind,
    attemptIndex: decision.attemptIndex,
    evidence,
    now,
    programTitle: status.title,
  })
  return {
    assignment,
    reason: assignment ? 'schedule_candidate_research' : 'candidate_assignment_rejected',
    workKind: decision.workKind,
  }
}

async function priorContextForAssignment(assignment: CosUniversityPhdResearchAssignment): Promise<string> {
  const records = await readCosUniversityPhdResearchWork(assignment.programId)
  return records
    .filter(record => record.run?.status === 'submitted'
      && record.product
      && record.assignment.researchProjectId === assignment.researchProjectId
      && record.assignment.protocolId === assignment.protocolId
      && record.assignment.assignmentKey !== assignment.assignmentKey)
    .sort((left, right) => Date.parse(left.product!.submittedAt) - Date.parse(right.product!.submittedAt))
    .slice(-4)
    .map(record => `Prior ungraded work product (${record.assignment.workKind}; academic credit=false):\n${record.product!.contentText}`)
    .join('\n\n')
    .slice(-MAX_PRIOR_CONTEXT_CHARS)
}

function buildResearchPrompt(assignment: CosUniversityPhdResearchAssignment, priorContext: string): string {
  const sections = [
    'PHD RESEARCH WORK PRODUCT — NOT AN EXAM AND NOT A DEGREE EVIDENCE RECORD.',
    'This work grants no academic credit. Independent host evaluation is required later.',
    `Work kind: ${assignment.workKind}. Attempt: ${assignment.attemptIndex}.`,
    `Objective: ${assignment.objective}`,
    'Use current authoritative or primary evidence when the task depends on external facts. Distinguish evidence, inference, uncertainty, and unresolved questions.',
    'Do not claim an experiment, replication, peer review, committee judgment, or external action happened unless supplied evidence proves it.',
  ]
  if (assignment.workKind === 'primary_literature_research') sections.push(
    'Produce sections: Research Question; Primary Sources; Findings; Methodological Weaknesses; Contradictions; Unknowns; Next Test.',
    'Prefer primary papers, official datasets, standards, or first-party technical evidence. Identify weak methods and unsupported assumptions.',
  )
  if (assignment.workKind === 'hypothesis_development') sections.push(
    'Produce sections: Hypotheses; Competing Explanations; Predictions; Discriminating Tests; Measurements; Falsification Criteria; Risks.',
    'Every hypothesis must be falsifiable and materially distinguishable from its alternatives.',
  )
  if (assignment.workKind === 'experiment_protocol_design') sections.push(
    'Produce a protocol draft only. Include hypothesis, variables, controls, measurement plan, confounders, stopping rule, falsification criteria, reproducibility artifacts, and replication plan.',
    'Do not state that the experiment was run.',
  )
  if (assignment.workKind === 'peer_critique_response') sections.push(
    'Address each independent critique with evidence, correction, or explicit unresolved limitation. Do not mark the critique resolved yourself.',
  )
  if (assignment.workKind === 'dissertation_synthesis') sections.push(
    'Synthesize the coherent research lineage, evidence, limitations, novelty claim, alternative explanations, and unresolved questions. Do not judge your own novelty or award a degree.',
  )
  if (priorContext) sections.push(`Context from prior ungraded work products (not authoritative evidence):\n${priorContext}`)
  return sections.join('\n\n')
}

async function executeCandidateAssignment(
  assignment: CosUniversityPhdResearchAssignment,
  now: Date,
): Promise<CosUniversityPhdResearchCycleSummary> {
  const claimed = await claimCandidateAssignment(assignment, now)
  if (!claimed) return {
    enabled: true,
    programId: assignment.programId,
    assignmentKey: assignment.assignmentKey,
    workKind: assignment.workKind,
    status: 'not_claimed',
    reason: 'research_work_claim_not_acquired',
    academicCredit: false,
    turnId: null,
    contentHash: null,
  }

  const prompt = buildResearchPrompt(assignment, await priorContextForAssignment(assignment))
  beginEvidenceSourceUseTurn()
  let result: Awaited<ReturnType<typeof tryCOSFirstAnswer>>
  try {
    if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
      await ensureLocalInferenceRuntimeReady()
      await generateLocalEmbedding(prompt)
    }
    result = await tryCOSFirstAnswer({
      prompt,
      language: 'en',
      privileged: true,
      disableCache: true,
    })
  } catch (error) {
    flushCapturedEvidenceSourceUse()
    const reason = `research_execution_error:${error instanceof Error ? error.message : String(error)}`
    await failCandidateAssignment(assignment, reason)
    return {
      enabled: true,
      programId: assignment.programId,
      assignmentKey: assignment.assignmentKey,
      workKind: assignment.workKind,
      status: 'failed',
      reason: clean(reason, 1000),
      academicCredit: false,
      turnId: null,
      contentHash: null,
    }
  }

  const turnId = peekEvidenceSourceUseTurnId()
  const semanticCache = result.provenance.responseSource === 'semantic_cache'
    || result.provenance.responseSource === 'semantic_similarity'
  const reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
  const candidateIdentity = await loadCandidateIdentity(assignment.candidateActorId)
  const reasonerFingerprint = clean(result.provenance.reasonerLabel, 500)
  const candidateMatchesReasoner = Boolean(
    candidateIdentity
    && candidateIdentity.actorRole === 'candidate'
    && candidateIdentity.principalType === 'ai_model'
    && cosUniversityPhdActorIdentityEligible(candidateIdentity, now)
    && reasonerFingerprint
    && clean(candidateIdentity.principalFingerprint, 500) === reasonerFingerprint,
  )
  const freshLocal = Boolean(
    result.handled
    && result.provenance.localModelInvoked
    && !result.provenance.externalAiInvoked
    && !semanticCache
    && candidateMatchesReasoner
    && turnId
    && String(reply || '').trim(),
  )
  flushCapturedEvidenceSourceUse()
  if (!freshLocal || !turnId) {
    const failureReason = candidateMatchesReasoner
      ? 'fresh_local_research_execution_required'
      : 'research_reasoner_principal_mismatch'
    await failCandidateAssignment(assignment, failureReason)
    return {
      enabled: true,
      programId: assignment.programId,
      assignmentKey: assignment.assignmentKey,
      workKind: assignment.workKind,
      status: 'failed',
      reason: failureReason,
      academicCredit: false,
      turnId: turnId || null,
      contentHash: null,
    }
  }

  const product = await persistCandidateProduct({
    assignment,
    contentText: reply,
    sourceRef: `cos_turn:${turnId}`,
    submittedAt: new Date(),
    turnId,
    responseSource: result.provenance.responseSource,
    localModelInvoked: result.provenance.localModelInvoked,
    externalAiInvoked: result.provenance.externalAiInvoked,
    semanticCache,
  })
  if (!product) {
    await failCandidateAssignment(assignment, 'research_product_not_persisted')
    return {
      enabled: true,
      programId: assignment.programId,
      assignmentKey: assignment.assignmentKey,
      workKind: assignment.workKind,
      status: 'failed',
      reason: 'research_product_not_persisted',
      academicCredit: false,
      turnId,
      contentHash: null,
    }
  }
  return {
    enabled: true,
    programId: assignment.programId,
    assignmentKey: assignment.assignmentKey,
    workKind: assignment.workKind,
    status: 'submitted',
    reason: 'research_product_awaits_independent_evaluation',
    academicCredit: cosUniversityPhdResearchWorkAcademicCredit(),
    turnId,
    contentHash: product.contentHash,
  }
}

function noWorkStatus(reason: string): CosUniversityPhdResearchCycleSummary['status'] {
  if (reason === 'not_enrolled') return 'not_enrolled'
  if (reason === 'program_inactive') return 'program_inactive'
  if (reason === 'research_project_required') return 'research_project_required'
  if (reason === 'ambiguous_research_lineage') return 'ambiguous_research_lineage'
  if (reason === 'candidate_research_work_active') return 'work_active'
  if (reason === 'awaiting_independent_evaluation') return 'awaiting_independent_evaluation'
  if (reason.includes('independent_') || reason === 'governed_experiment_execution_required') return 'independent_boundary'
  return 'no_candidate_work'
}

export async function runCosUniversityPhdResearchCycle(now = new Date()): Promise<CosUniversityPhdResearchCycleSummary> {
  if (process.env.COS_UNIVERSITY_PHD_RESEARCH_EXECUTION_ENABLED !== 'true') {
    return {
      enabled: false,
      programId: null,
      assignmentKey: null,
      workKind: null,
      status: 'disabled',
      reason: 'phd_research_execution_disabled',
      academicCredit: false,
      turnId: null,
      contentHash: null,
    }
  }
  const programIds = Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[]
  for (const programId of programIds) {
    try {
      const status = await readCosUniversityPhdRuntimeStatus(programId, now)
      if (!status.enrollment && !status.credential) continue
      const next = await ensureNextCandidateAssignment(programId, now)
      if (!next.assignment) return {
        enabled: true,
        programId,
        assignmentKey: null,
        workKind: next.workKind,
        status: noWorkStatus(next.reason),
        reason: next.reason,
        academicCredit: false,
        turnId: null,
        contentHash: null,
      }
      return executeCandidateAssignment(next.assignment, now)
    } catch (error) {
      return {
        enabled: true,
        programId,
        assignmentKey: null,
        workKind: null,
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
        academicCredit: false,
        turnId: null,
        contentHash: null,
      }
    }
  }
  return {
    enabled: true,
    programId: null,
    assignmentKey: null,
    workKind: null,
    status: 'not_enrolled',
    reason: 'no_active_phd_enrollment',
    academicCredit: false,
    turnId: null,
    contentHash: null,
  }
}
