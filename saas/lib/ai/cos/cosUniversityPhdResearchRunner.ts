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

const INDEPENDENT_ROLE_BY_WORK: Partial<Record<CosUniversityPhdResearchWorkKind, CosUniversityPhdActorIdentity['actorRole']>> = Object.freeze({
  independent_replication: 'replicator',
  peer_review: 'peer_reviewer',
  dissertation_review: 'dissertation_committee',
})

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

async function loadActor(actorId: string): Promise<CosUniversityPhdActorIdentity | null> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_actor_identities')
    .select('actor_id,actor_role,principal_type,principal_fingerprint,source_ref,valid_from,valid_until')
    .eq('actor_id', clean(actorId, 300))
    .maybeSingle()
  if (result.error) throw result.error
  return mapActor((result.data || null) as ActorRow | null)
}

async function loadActors(actorIds: readonly string[]): Promise<CosUniversityPhdActorIdentity[]> {
  const ids = [...new Set(actorIds.map(id => clean(id, 300)).filter(Boolean))]
  if (!ids.length) return []
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_actor_identities')
    .select('actor_id,actor_role,principal_type,principal_fingerprint,source_ref,valid_from,valid_until')
    .in('actor_id', ids)
  if (result.error) throw result.error
  return ((result.data || []) as ActorRow[]).map(row => mapActor(row)!).filter(Boolean)
}

async function loadAssignments(programId: CosUniversityPhdProgramId): Promise<CosUniversityPhdResearchAssignment[]> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_work_assignments')
    .select('assignment_key,program_id,research_project_id,protocol_id,candidate_actor_id,performer_actor_id,work_kind,academic_stage,attempt_index,parent_evidence_ids,objective,objective_hash,source_ref,assigned_at,not_after')
    .eq('agent_id', AGENT_ID)
    .eq('program_key', cosUniversityPhdProgramKey(programId))
    .order('assigned_at', { ascending: true })
  if (result.error) throw result.error
  return ((result.data || []) as AssignmentRow[]).map(mapAssignment)
}

async function loadRuns(assignmentKeys: readonly string[]): Promise<Map<string, CosUniversityPhdResearchRun>> {
  if (!assignmentKeys.length) return new Map()
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_work_runs')
    .select('run_key,assignment_key,status,failure_reason,started_at,claim_expires_at,completed_at,turn_id,response_source,local_model_invoked,external_ai_invoked,semantic_cache')
    .in('assignment_key', [...assignmentKeys])
  if (result.error) throw result.error
  return new Map(((result.data || []) as RunRow[]).map(row => [row.assignment_key, mapRun(row)!]))
}

async function loadProducts(assignmentKeys: readonly string[]): Promise<Map<string, CosUniversityPhdResearchProduct>> {
  if (!assignmentKeys.length) return new Map()
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_work_products')
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

function exactProject(
  projects: readonly CosUniversityPhdProject[],
  input: Pick<CosUniversityPhdResearchAssignment, 'candidateActorId' | 'researchProjectId' | 'protocolId'>,
): CosUniversityPhdProject | null {
  return projects.find(project => project.candidateActorId === input.candidateActorId
    && project.researchProjectId === input.researchProjectId
    && project.protocolId === input.protocolId) ?? null
}

async function performerAllowed(input: {
  workKind: CosUniversityPhdResearchWorkKind
  performerActorId: string
  candidateActorId: string
  evidence: readonly CosUniversityPhdEvidence[]
  observedAt: Date
}): Promise<boolean> {
  const [performer, candidate] = await Promise.all([
    loadActor(input.performerActorId),
    loadActor(input.candidateActorId),
  ])
  if (!performer || !candidate) return false
  if (!cosUniversityPhdActorIdentityEligible(performer, input.observedAt)
    || !cosUniversityPhdActorIdentityEligible(candidate, input.observedAt)
    || candidate.actorRole !== 'candidate') return false

  if (AUTO_CANDIDATE_WORK.has(input.workKind)) {
    return performer.actorId === candidate.actorId && performer.principalFingerprint === candidate.principalFingerprint
  }

  const requiredRole = INDEPENDENT_ROLE_BY_WORK[input.workKind]
  if (!requiredRole || performer.actorRole !== requiredRole || performer.actorId === candidate.actorId) return false
  if (performer.principalFingerprint === candidate.principalFingerprint) return false

  const priorCritical = input.evidence.filter(row => row.passed && [
    'preregistered_experiment',
    'independent_replication',
    'peer_critique_defense',
  ].includes(row.stage))
  const actorIds = [...new Set(priorCritical.flatMap(row => [...row.performerActorIds, ...row.evaluatorActorIds]))]
  const priorActors = await loadActors(actorIds)
  return !priorActors.some(actor => actor.principalFingerprint === performer.principalFingerprint)
}

function parentStageForWork(workKind: CosUniversityPhdResearchWorkKind): CosUniversityPhdEvidenceStage | null {
  if (workKind === 'hypothesis_development') return 'primary_literature_synthesis'
  if (workKind === 'experiment_protocol_design') return 'hypothesis_proposal'
  if (workKind === 'independent_replication') return 'preregistered_experiment'
  if (workKind === 'peer_review' || workKind === 'peer_critique_response') return 'independent_replication'
  if (workKind === 'dissertation_synthesis' || workKind === 'dissertation_review') return 'peer_critique_defense'
  return null
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
  if (workKind === 'independent_replication') return `Independently replicate the linked experiment under the frozen protocol and report reproducible artifacts. Research objective: ${project}`
  if (workKind === 'peer_review') return `Perform an independent adversarial peer review of the linked research lineage. Research objective: ${project}`
  if (workKind === 'peer_critique_response') return `Respond to the independent peer critique with evidence-bounded corrections and unresolved limitations. Research objective: ${project}`
  if (workKind === 'dissertation_synthesis') return `Synthesize the coherent research lineage into a dissertation-quality argument while preserving uncertainty. Research objective: ${project}`
  return `Perform an independent dissertation review focused on novelty, evidence, reproducibility, and unresolved limitations. Research objective: ${project}`
}

async function ensureRun(assignmentKey: string): Promise<void> {
  const db = dbOrThrow()
  const runKey = digest(`phd-work-run|${assignmentKey}`)
  const result = await db.from('cos_university_phd_work_runs').insert({
    run_key: runKey,
    assignment_key: assignmentKey,
    status: 'created',
  })
  if (result.error && String((result.error as { code?: string }).code || '') !== '23505') throw result.error
}

export async function recordHostCosUniversityPhdResearchAssignment(input: {
  programId: CosUniversityPhdProgramId
  researchProjectId: string
  protocolId: string
  candidateActorId: string
  performerActorId: string
  workKind: CosUniversityPhdResearchWorkKind
  attemptIndex: number
  parentEvidenceIds?: readonly string[]
  objective: string
  sourceRef: string
  assignedAt?: Date
}): Promise<CosUniversityPhdResearchAssignment | null> {
  const assignedAt = input.assignedAt instanceof Date ? input.assignedAt : new Date()
  const objective = clean(input.objective, 4000)
  const sourceRef = clean(input.sourceRef, 1000)
  const candidateActorId = clean(input.candidateActorId, 300)
  const performerActorId = clean(input.performerActorId, 300)
  const researchProjectId = clean(input.researchProjectId, 300)
  const protocolId = clean(input.protocolId, 300)
  const attemptIndex = Math.max(0, Math.floor(input.attemptIndex))
  if (!COS_UNIVERSITY_PHD_PROGRAMS[input.programId] || !objective || !sourceRef || !candidateActorId || !performerActorId
    || !researchProjectId || !protocolId || !Number.isFinite(assignedAt.getTime())) return null

  const status = await readCosUniversityPhdRuntimeStatus(input.programId, assignedAt)
  if (!status.enrollment || status.credential || status.timingStatus === 'deadline_expired' || status.timingStatus === 'not_enrolled') return null
  const project = exactProject(status.projects, {
    assignmentKey: '', programId: input.programId, researchProjectId, protocolId, candidateActorId, performerActorId,
    workKind: input.workKind, academicStage: WORK_STAGE[input.workKind], attemptIndex, parentEvidenceIds: [], objective,
    objectiveHash: '', sourceRef, assignedAt: '', notAfter: '', academicCredit: false,
  })
  if (!project) return null

  const evidence = (await readCosUniversityPhdEvidence(input.programId)).filter(row => row.researchProjectId === researchProjectId
    && row.protocolId === protocolId && row.candidateActorId === candidateActorId)
  if (!(await performerAllowed({ workKind: input.workKind, performerActorId, candidateActorId, evidence, observedAt: assignedAt }))) return null

  const requestedParents = [...new Set((input.parentEvidenceIds || []).map(id => clean(id, 300)).filter(Boolean))]
  if (requestedParents.length) {
    const evidenceById = new Map(evidence.map(row => [row.evidenceId, row]))
    const parents = requestedParents.map(id => evidenceById.get(id)).filter((row): row is CosUniversityPhdEvidence => Boolean(row))
    if (parents.length !== requestedParents.length) return null
    if (parents.some(row => Date.parse(row.observedAt) >= assignedAt.getTime())) return null
  }

  const academicStage = WORK_STAGE[input.workKind]
  const objectiveHash = digest(objective)
  const assignmentKey = digest([
    AGENT_ID, input.programId, researchProjectId, protocolId, candidateActorId, performerActorId,
    input.workKind, academicStage, String(attemptIndex), objectiveHash, requestedParents.join(','),
  ].join('|'))
  const hardDeadline = Date.parse(status.enrollment.hardDeadlineAt)
  const notAfter = new Date(Math.min(hardDeadline, assignedAt.getTime() + DEFAULT_WORK_WINDOW_MS))
  if (!(assignedAt.getTime() < notAfter.getTime())) return null

  const db = dbOrThrow()
  const insert = await db.from('cos_university_phd_work_assignments').insert({
    assignment_key: assignmentKey,
    agent_id: AGENT_ID,
    program_key: status.programKey,
    program_id: input.programId,
    research_project_id: researchProjectId,
    protocol_id: protocolId,
    candidate_actor_id: candidateActorId,
    performer_actor_id: performerActorId,
    work_kind: input.workKind,
    academic_stage: academicStage,
    attempt_index: attemptIndex,
    parent_evidence_ids: requestedParents,
    objective,
    objective_hash: objectiveHash,
    source_ref: sourceRef,
    assigned_at: assignedAt.toISOString(),
    not_after: notAfter.toISOString(),
  }).select('assignment_key,program_id,research_project_id,protocol_id,candidate_actor_id,performer_actor_id,work_kind,academic_stage,attempt_index,parent_evidence_ids,objective,objective_hash,source_ref,assigned_at,not_after').maybeSingle()

  let assignment: CosUniversityPhdResearchAssignment | null = null
  if (!insert.error && insert.data) assignment = mapAssignment(insert.data as AssignmentRow)
  else if (insert.error && String((insert.error as { code?: string }).code || '') === '23505') {
    const existing = await db.from('cos_university_phd_work_assignments')
      .select('assignment_key,program_id,research_project_id,protocol_id,candidate_actor_id,performer_actor_id,work_kind,academic_stage,attempt_index,parent_evidence_ids,objective,objective_hash,source_ref,assigned_at,not_after')
      .eq('agent_id', AGENT_ID)
      .eq('program_key', status.programKey)
      .eq('research_project_id', researchProjectId)
      .eq('protocol_id', protocolId)
      .eq('work_kind', input.workKind)
      .eq('attempt_index', attemptIndex)
      .maybeSingle()
    if (existing.error) throw existing.error
    const row = (existing.data || null) as AssignmentRow | null
    if (!row || row.assignment_key !== assignmentKey) return null
    assignment = mapAssignment(row)
  } else if (insert.error) throw insert.error

  if (!assignment) return null
  await ensureRun(assignment.assignmentKey)
  return assignment
}

async function loadRunForAssignment(assignmentKey: string): Promise<CosUniversityPhdResearchRun | null> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_work_runs')
    .select('run_key,assignment_key,status,failure_reason,started_at,claim_expires_at,completed_at,turn_id,response_source,local_model_invoked,external_ai_invoked,semantic_cache')
    .eq('assignment_key', assignmentKey)
    .maybeSingle()
  if (result.error) throw result.error
  return mapRun((result.data || null) as RunRow | null)
}

async function loadAssignmentByKey(assignmentKey: string): Promise<CosUniversityPhdResearchAssignment | null> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_work_assignments')
    .select('assignment_key,program_id,research_project_id,protocol_id,candidate_actor_id,performer_actor_id,work_kind,academic_stage,attempt_index,parent_evidence_ids,objective,objective_hash,source_ref,assigned_at,not_after')
    .eq('assignment_key', assignmentKey)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data ? mapAssignment(result.data as AssignmentRow) : null
}

export async function claimHostCosUniversityPhdResearchWork(
  assignmentKeyInput: string,
  actorIdInput: string,
  now = new Date(),
): Promise<boolean> {
  const assignmentKey = clean(assignmentKeyInput, 500)
  const actorId = clean(actorIdInput, 300)
  if (!assignmentKey || !actorId || !Number.isFinite(now.getTime())) return false
  const assignment = await loadAssignmentByKey(assignmentKey)
  const run = await loadRunForAssignment(assignmentKey)
  if (!assignment || !run || assignment.performerActorId !== actorId || Date.parse(assignment.notAfter) <= now.getTime()) return false
  if (run.status !== 'created') return false
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_work_runs').update({
    status: 'running',
    started_at: now.toISOString(),
    claim_expires_at: new Date(now.getTime() + CLAIM_TTL_MS).toISOString(),
    updated_at: now.toISOString(),
  }).eq('assignment_key', assignmentKey).eq('status', 'created').select('assignment_key').maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data?.assignment_key)
}

export async function recordHostCosUniversityPhdResearchProduct(input: {
  assignmentKey: string
  actorId: string
  contentText: string
  sourceRef: string
  submittedAt?: Date
  provenance?: {
    turnId?: string | null
    responseSource?: string | null
    localModelInvoked?: boolean | null
    externalAiInvoked?: boolean | null
    semanticCache?: boolean | null
  }
}): Promise<CosUniversityPhdResearchProduct | null> {
  const assignmentKey = clean(input.assignmentKey, 500)
  const actorId = clean(input.actorId, 300)
  const contentText = String(input.contentText || '').trim().slice(0, MAX_PRODUCT_CHARS)
  const sourceRef = clean(input.sourceRef, 1000)
  const submittedAt = input.submittedAt instanceof Date ? input.submittedAt : new Date()
  if (!assignmentKey || !actorId || !contentText || !sourceRef || !Number.isFinite(submittedAt.getTime())) return null
  const [assignment, run] = await Promise.all([loadAssignmentByKey(assignmentKey), loadRunForAssignment(assignmentKey)])
  if (!assignment || !run || assignment.performerActorId !== actorId || run.status !== 'running') return null
  if (submittedAt.getTime() < Date.parse(assignment.assignedAt) || submittedAt.getTime() > Date.parse(assignment.notAfter)) return null

  const contentHash = digest(contentText)
  const productKey = digest(`phd-work-product|${assignmentKey}|${actorId}|${contentHash}`)
  const db = dbOrThrow()
  const insert = await db.from('cos_university_phd_work_products').insert({
    product_key: productKey,
    assignment_key: assignmentKey,
    actor_id: actorId,
    content_text: contentText,
    content_hash: contentHash,
    source_ref: sourceRef,
    submitted_at: submittedAt.toISOString(),
    academic_credit: false,
  }).select('product_key,assignment_key,actor_id,content_text,content_hash,source_ref,submitted_at,academic_credit').maybeSingle()

  let product: CosUniversityPhdResearchProduct | null = null
  if (!insert.error && insert.data) product = mapProduct(insert.data as ProductRow)
  else if (insert.error && String((insert.error as { code?: string }).code || '') === '23505') {
    const existing = await db.from('cos_university_phd_work_products')
      .select('product_key,assignment_key,actor_id,content_text,content_hash,source_ref,submitted_at,academic_credit')
      .eq('assignment_key', assignmentKey)
      .maybeSingle()
    if (existing.error) throw existing.error
    const row = (existing.data || null) as ProductRow | null
    if (!row || row.content_hash !== contentHash || row.actor_id !== actorId) return null
    product = mapProduct(row)
  } else if (insert.error) throw insert.error

  if (!product) return null
  const provenance = input.provenance || {}
  const update = await db.from('cos_university_phd_work_runs').update({
    status: 'submitted',
    completed_at: submittedAt.toISOString(),
    claim_expires_at: null,
    turn_id: provenance.turnId || null,
    response_source: provenance.responseSource || null,
    local_model_invoked: provenance.localModelInvoked ?? null,
    external_ai_invoked: provenance.externalAiInvoked ?? null,
    semantic_cache: provenance.semanticCache ?? null,
    updated_at: submittedAt.toISOString(),
  }).eq('assignment_key', assignmentKey).in('status', ['running', 'submitted'])
  if (update.error) throw update.error
  return product
}

export async function failHostCosUniversityPhdResearchWork(
  assignmentKeyInput: string,
  actorIdInput: string,
  reasonInput: string,
  now = new Date(),
): Promise<boolean> {
  const assignmentKey = clean(assignmentKeyInput, 500)
  const actorId = clean(actorIdInput, 300)
  const reason = clean(reasonInput, 1000)
  const assignment = assignmentKey ? await loadAssignmentByKey(assignmentKey) : null
  if (!assignment || assignment.performerActorId !== actorId || !reason || !Number.isFinite(now.getTime())) return false
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_work_runs').update({
    status: 'failed',
    failure_reason: reason,
    completed_at: now.toISOString(),
    claim_expires_at: null,
    updated_at: now.toISOString(),
  }).eq('assignment_key', assignmentKey).eq('status', 'running').select('assignment_key').maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data?.assignment_key)
}

async function recoverStaleRuns(programId: CosUniversityPhdProgramId, now: Date): Promise<void> {
  const records = await readCosUniversityPhdResearchWork(programId)
  const stale = records.filter(record => record.run?.status === 'running'
    && record.run.claimExpiresAt
    && Date.parse(record.run.claimExpiresAt) <= now.getTime())
  const db = dbOrThrow()
  for (const record of stale) {
    const result = await db.from('cos_university_phd_work_runs').update({
      status: 'failed',
      failure_reason: 'stale_research_claim_recovered',
      completed_at: now.toISOString(),
      claim_expires_at: null,
      updated_at: now.toISOString(),
    }).eq('assignment_key', record.assignment.assignmentKey).eq('status', 'running')
    if (result.error) throw result.error
  }
}

function policyRuns(records: readonly CosUniversityPhdResearchWorkRecord[]): CosUniversityPhdResearchRunState[] {
  return records.flatMap(record => record.run ? [{
    workKind: record.assignment.workKind,
    attemptIndex: record.assignment.attemptIndex,
    status: record.run.status,
    completedAt: record.run.completedAt,
  }] : [])
}

function parentEvidenceIdsForWork(
  workKind: CosUniversityPhdResearchWorkKind,
  evidence: readonly CosUniversityPhdEvidence[],
): string[] {
  const parentStage = parentStageForWork(workKind)
  if (!parentStage) return []
  return evidence
    .filter(row => row.stage === parentStage && row.passed)
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
    .map(row => row.evidenceId)
}

async function ensureNextCandidateAssignment(
  programId: CosUniversityPhdProgramId,
  now: Date,
): Promise<{ assignment: CosUniversityPhdResearchAssignment | null; reason: string; workKind: CosUniversityPhdResearchWorkKind | null }> {
  await recoverStaleRuns(programId, now)
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
    && row.protocolId === project.protocolId && row.candidateActorId === project.candidateActorId)
  const decision = decideNextCosUniversityPhdCandidateResearch({
    graduationBlockers: status.graduation.blockers,
    runs: policyRuns(records.filter(record => record.assignment.researchProjectId === project.researchProjectId
      && record.assignment.protocolId === project.protocolId)),
    evidence: evidence.map(row => ({ stage: row.stage, passed: row.passed, observedAt: row.observedAt })),
  })
  if (!decision.workKind || decision.attemptIndex === null) return { assignment: null, reason: decision.reason, workKind: null }
  if (!AUTO_CANDIDATE_WORK.has(decision.workKind)) return { assignment: null, reason: 'independent_boundary', workKind: decision.workKind }

  const objective = objectiveForWork(decision.workKind, status.title, project.researchObjective)
  const assignment = await recordHostCosUniversityPhdResearchAssignment({
    programId,
    researchProjectId: project.researchProjectId,
    protocolId: project.protocolId,
    candidateActorId: project.candidateActorId,
    performerActorId: project.candidateActorId,
    workKind: decision.workKind,
    attemptIndex: decision.attemptIndex,
    parentEvidenceIds: parentEvidenceIdsForWork(decision.workKind, evidence),
    objective,
    sourceRef: `host_phd_research_scheduler:${project.projectKey}`,
    assignedAt: now,
  })
  return { assignment, reason: assignment ? 'schedule_candidate_research' : 'candidate_assignment_rejected', workKind: decision.workKind }
}

async function priorContextForAssignment(assignment: CosUniversityPhdResearchAssignment): Promise<string> {
  const records = await readCosUniversityPhdResearchWork(assignment.programId)
  const products = records
    .filter(record => record.product
      && record.assignment.researchProjectId === assignment.researchProjectId
      && record.assignment.protocolId === assignment.protocolId
      && record.assignment.assignmentKey !== assignment.assignmentKey)
    .sort((a, b) => Date.parse(a.product!.submittedAt) - Date.parse(b.product!.submittedAt))
    .slice(-4)
    .map(record => `Prior ungraded work product (${record.assignment.workKind}; academic credit=false):\n${record.product!.contentText}`)
  return products.join('\n\n').slice(-MAX_PRIOR_CONTEXT_CHARS)
}

function buildResearchPrompt(assignment: CosUniversityPhdResearchAssignment, priorContext: string): string {
  const header = [
    'PHD RESEARCH WORK PRODUCT — NOT AN EXAM AND NOT A DEGREE EVIDENCE RECORD.',
    'This work grants no academic credit. Independent host evaluation is required later.',
    `Work kind: ${assignment.workKind}. Attempt: ${assignment.attemptIndex}.`,
    `Objective: ${assignment.objective}`,
    'Use current authoritative/primary evidence when the task depends on external facts. Distinguish evidence, inference, uncertainty, and unresolved questions.',
    'Do not claim an experiment, replication, peer review, committee judgment, or external action happened unless supplied evidence proves it.',
  ]
  if (assignment.workKind === 'primary_literature_research') header.push(
    'Produce sections: Research Question; Primary Sources; Findings; Methodological Weaknesses; Contradictions; Unknowns; Next Test.',
    'Prefer primary papers, official datasets, standards, or first-party technical evidence. Identify weak methods and unsupported assumptions.',
  )
  if (assignment.workKind === 'hypothesis_development') header.push(
    'Produce sections: Hypotheses; Competing Explanations; Predictions; Discriminating Tests; Measurements; Falsification Criteria; Risks.',
    'Every hypothesis must be falsifiable and materially distinguishable from its alternatives.',
  )
  if (assignment.workKind === 'experiment_protocol_design') header.push(
    'Produce a protocol draft only. Include hypothesis, variables, controls, measurement plan, confounders, stopping rule, falsification criteria, reproducibility artifacts, and replication plan.',
    'Do not state that the experiment was run.',
  )
  if (assignment.workKind === 'peer_critique_response') header.push(
    'Address each independent critique with evidence, correction, or explicit unresolved limitation. Do not mark the critique resolved yourself.',
  )
  if (assignment.workKind === 'dissertation_synthesis') header.push(
    'Synthesize the coherent lineage, evidence, limitations, novelty claim, alternative explanations, and unresolved questions. Do not judge your own novelty or award a degree.',
  )
  if (priorContext) header.push(`Context from prior ungraded work products (not authoritative evidence):\n${priorContext}`)
  return header.join('\n\n')
}

async function executeCandidateAssignment(
  assignment: CosUniversityPhdResearchAssignment,
  now: Date,
): Promise<CosUniversityPhdResearchCycleSummary> {
  const claimed = await claimHostCosUniversityPhdResearchWork(assignment.assignmentKey, assignment.performerActorId, now)
  if (!claimed) return {
    enabled: true, programId: assignment.programId, assignmentKey: assignment.assignmentKey, workKind: assignment.workKind,
    status: 'not_claimed', reason: 'research_work_claim_not_acquired', academicCredit: false, turnId: null, contentHash: null,
  }

  const priorContext = await priorContextForAssignment(assignment)
  const prompt = buildResearchPrompt(assignment, priorContext)
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
    const reason = `research_execution_error:${error instanceof Error ? error.message : String(error)}`.slice(0, 1000)
    await failHostCosUniversityPhdResearchWork(assignment.assignmentKey, assignment.performerActorId, reason, new Date())
    return {
      enabled: true, programId: assignment.programId, assignmentKey: assignment.assignmentKey, workKind: assignment.workKind,
      status: 'failed', reason, academicCredit: false, turnId: null, contentHash: null,
    }
  }

  const turnId = peekEvidenceSourceUseTurnId()
  const semanticCache = result.provenance.responseSource === 'semantic_cache' || result.provenance.responseSource === 'semantic_similarity'
  const reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
  const freshLocal = Boolean(result.handled
    && result.provenance.localModelInvoked
    && !result.provenance.externalAiInvoked
    && !semanticCache
    && turnId
    && String(reply || '').trim())
  flushCapturedEvidenceSourceUse()
  if (!freshLocal) {
    await failHostCosUniversityPhdResearchWork(assignment.assignmentKey, assignment.performerActorId, 'fresh_local_research_execution_required', new Date())
    return {
      enabled: true, programId: assignment.programId, assignmentKey: assignment.assignmentKey, workKind: assignment.workKind,
      status: 'failed', reason: 'fresh_local_research_execution_required', academicCredit: false, turnId: turnId || null, contentHash: null,
    }
  }

  const product = await recordHostCosUniversityPhdResearchProduct({
    assignmentKey: assignment.assignmentKey,
    actorId: assignment.performerActorId,
    contentText: reply,
    sourceRef: `cos_turn:${turnId}`,
    submittedAt: new Date(),
    provenance: {
      turnId,
      responseSource: result.provenance.responseSource,
      localModelInvoked: result.provenance.localModelInvoked,
      externalAiInvoked: result.provenance.externalAiInvoked,
      semanticCache,
    },
  })
  if (!product) {
    await failHostCosUniversityPhdResearchWork(assignment.assignmentKey, assignment.performerActorId, 'research_product_not_persisted', new Date())
    return {
      enabled: true, programId: assignment.programId, assignmentKey: assignment.assignmentKey, workKind: assignment.workKind,
      status: 'failed', reason: 'research_product_not_persisted', academicCredit: false, turnId: turnId || null, contentHash: null,
    }
  }
  return {
    enabled: true, programId: assignment.programId, assignmentKey: assignment.assignmentKey, workKind: assignment.workKind,
    status: 'submitted', reason: 'research_product_awaits_independent_evaluation', academicCredit: cosUniversityPhdResearchWorkAcademicCredit(),
    turnId: turnId || null, contentHash: product.contentHash,
  }
}

function noWorkStatus(reason: string): CosUniversityPhdResearchCycleSummary['status'] {
  if (reason === 'not_enrolled') return 'not_enrolled'
  if (reason === 'program_inactive') return 'program_inactive'
  if (reason === 'research_project_required') return 'research_project_required'
  if (reason === 'ambiguous_research_lineage') return 'ambiguous_research_lineage'
  if (reason === 'candidate_research_work_active') return 'work_active'
  if (reason.includes('independent_') || reason === 'governed_experiment_execution_required') return 'independent_boundary'
  if (reason === 'awaiting_independent_evaluation') return 'awaiting_independent_evaluation'
  return 'no_candidate_work'
}

export async function runCosUniversityPhdResearchCycle(now = new Date()): Promise<CosUniversityPhdResearchCycleSummary> {
  if (process.env.COS_UNIVERSITY_PHD_RESEARCH_EXECUTION_ENABLED !== 'true') {
    return { enabled: false, programId: null, assignmentKey: null, workKind: null, status: 'disabled', reason: 'phd_research_execution_disabled', academicCredit: false, turnId: null, contentHash: null }
  }
  const ids = Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[]
  for (const programId of ids) {
    try {
      const status = await readCosUniversityPhdRuntimeStatus(programId, now)
      if (!status.enrollment && !status.credential) continue
      const next = await ensureNextCandidateAssignment(programId, now)
      if (!next.assignment) {
        return {
          enabled: true, programId, assignmentKey: null, workKind: next.workKind,
          status: noWorkStatus(next.reason), reason: next.reason, academicCredit: false, turnId: null, contentHash: null,
        }
      }
      return executeCandidateAssignment(next.assignment, now)
    } catch (error) {
      return {
        enabled: true, programId, assignmentKey: null, workKind: null, status: 'error',
        reason: error instanceof Error ? error.message : String(error), academicCredit: false, turnId: null, contentHash: null,
      }
    }
  }
  return { enabled: true, programId: null, assignmentKey: null, workKind: null, status: 'not_enrolled', reason: 'no_active_phd_enrollment', academicCredit: false, turnId: null, contentHash: null }
}
