import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  buildCosUniversityProgramEnrollment,
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
  type CosUniversityProgramTimingStatus,
} from './cosUniversityPrograms.ts'
import type { CosUniversityCredential } from './cosUniversityCredentials.ts'
import {
  COS_UNIVERSITY_PHD_PROGRAMS,
  cosUniversityPhdCredentialKey,
  cosUniversityPhdEvidenceEligible,
  cosUniversityPhdExpectedAuthority,
  cosUniversityPhdProgramKey,
  evaluateCosUniversityPhdAdmission,
  evaluateCosUniversityPhdGraduation,
  type CosUniversityPhdAdmissionDecision,
  type CosUniversityPhdEvidence,
  type CosUniversityPhdEvidenceAuthority,
  type CosUniversityPhdEvidenceStage,
  type CosUniversityPhdGraduationDecision,
  type CosUniversityPhdProgramId,
} from './cosUniversityPhd.ts'
import { readCosUniversityMastersRuntimeStatus } from './cosUniversityMastersRuntime.ts'

const AGENT_ID = 'cos'
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000
const DEFAULT_VALIDITY_DAYS = 365
const PHD_IDENTITY_PROVENANCE = 'host_identity_ledger' as const
const CRITICAL_PRINCIPAL_STAGES: readonly CosUniversityPhdEvidenceStage[] = Object.freeze([
  'preregistered_experiment',
  'independent_replication',
  'peer_critique_defense',
  'dissertation_defense',
])

const EVIDENCE_SELECT = [
  'evidence_key','evidence_id','program_id','stage','research_project_id','protocol_id',
  'candidate_actor_id','performer_actor_ids','evaluator_actor_ids','identity_provenance',
  'parent_evidence_ids','passed','variant_hash','independent','authority','primary_source_count',
  'protocol_frozen','reproducible_artifact_hash','replicated_artifact_hash',
  'independent_replication','critique_resolved','novelty_judged_independent','observed_at','valid_until',
].join(',')

type EnrollmentRow = {
  program_key: string
  program_level: 'phd'
  enrolled_at: string
  minimum_residence_until: string
  target_completion_at: string
  hard_deadline_at: string
}

type CredentialRow = {
  credential_key: string
  program_key: string
  program_level: 'phd'
  title: string
  standing: 'A' | 'A+'
  awarded_at: string
}

type ResearchNeedRow = {
  need_key: string
  program_id: CosUniversityPhdProgramId
  justified: boolean
  reason_code: CosUniversityPhdResearchNeedReason
  source_ref: string
  host_authority: 'university_research_strategy'
  observed_at: string
  valid_until: string
}

type ProjectRow = {
  project_key: string
  program_id: CosUniversityPhdProgramId
  candidate_actor_id: string
  research_project_id: string
  protocol_id: string
  research_objective: string
  source_ref: string
  opened_at: string
}

type EvidenceRow = {
  evidence_key: string
  evidence_id: string
  program_id: CosUniversityPhdProgramId
  stage: CosUniversityPhdEvidenceStage
  research_project_id: string
  protocol_id: string
  candidate_actor_id: string
  performer_actor_ids: string[]
  evaluator_actor_ids: string[]
  identity_provenance: typeof PHD_IDENTITY_PROVENANCE
  parent_evidence_ids: string[]
  passed: boolean
  variant_hash: string
  independent: boolean
  authority: CosUniversityPhdEvidenceAuthority
  primary_source_count: number | null
  protocol_frozen: boolean | null
  reproducible_artifact_hash: string | null
  replicated_artifact_hash: string | null
  independent_replication: boolean | null
  critique_resolved: boolean | null
  novelty_judged_independent: boolean | null
  observed_at: string
  valid_until: string
}

export type CosUniversityPhdActorRole =
  | 'candidate'
  | 'researcher'
  | 'experiment_evaluator'
  | 'replicator'
  | 'replication_panel'
  | 'peer_reviewer'
  | 'dissertation_committee'
  | 'methodology_examiner'
  | 'literature_panel'
  | 'hypothesis_committee'
  | 'faculty'
  | 'system'

export type CosUniversityPhdActorIdentity = Readonly<{
  actorId: string
  actorRole: CosUniversityPhdActorRole
  principalType: 'ai_model' | 'human' | 'service' | 'system'
  principalFingerprint: string
  sourceRef: string
  validFrom: string
  validUntil: string
}>

type ActorIdentityRow = {
  actor_id: string
  actor_role: CosUniversityPhdActorRole
  principal_type: CosUniversityPhdActorIdentity['principalType']
  principal_fingerprint: string
  source_ref: string
  valid_from: string
  valid_until: string
}

export type CosUniversityPhdResearchNeedReason =
  | 'repeated_unresolved_failure'
  | 'frontier_capability_gap'
  | 'replication_required'
  | 'production_research_need'
  | 'owner_research_directive'
  | 'organizational_research_value'

export type CosUniversityPhdResearchNeed = Readonly<{
  needKey: string
  programId: CosUniversityPhdProgramId
  justified: boolean
  reasonCode: CosUniversityPhdResearchNeedReason
  sourceRef: string
  observedAt: string
  validUntil: string
}>

export type CosUniversityPhdProject = Readonly<{
  projectKey: string
  programId: CosUniversityPhdProgramId
  candidateActorId: string
  researchProjectId: string
  protocolId: string
  researchObjective: string
  sourceRef: string
  openedAt: string
}>

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function validTime(value: string): number | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

function mapEnrollment(row: EnrollmentRow | null): CosUniversityProgramEnrollment | null {
  if (!row) return null
  return {
    programKey: row.program_key,
    programLevel: row.program_level,
    enrolledAt: row.enrolled_at,
    minimumResidenceUntil: row.minimum_residence_until,
    targetCompletionAt: row.target_completion_at,
    hardDeadlineAt: row.hard_deadline_at,
  }
}

function mapCredential(row: CredentialRow | null): CosUniversityCredential | null {
  if (!row) return null
  return {
    credentialKey: row.credential_key,
    programKey: row.program_key,
    programLevel: row.program_level,
    title: row.title,
    standing: row.standing,
    awardedAt: row.awarded_at,
  }
}

function mapNeed(row: ResearchNeedRow | null): CosUniversityPhdResearchNeed | null {
  if (!row) return null
  return {
    needKey: row.need_key,
    programId: row.program_id,
    justified: row.justified,
    reasonCode: row.reason_code,
    sourceRef: row.source_ref,
    observedAt: row.observed_at,
    validUntil: row.valid_until,
  }
}

function mapProject(row: ProjectRow): CosUniversityPhdProject {
  return {
    projectKey: row.project_key,
    programId: row.program_id,
    candidateActorId: row.candidate_actor_id,
    researchProjectId: row.research_project_id,
    protocolId: row.protocol_id,
    researchObjective: row.research_objective,
    sourceRef: row.source_ref,
    openedAt: row.opened_at,
  }
}

function mapEvidence(row: EvidenceRow): CosUniversityPhdEvidence {
  return {
    evidenceId: row.evidence_id,
    programId: row.program_id,
    stage: row.stage,
    researchProjectId: row.research_project_id,
    protocolId: row.protocol_id,
    candidateActorId: row.candidate_actor_id,
    performerActorIds: row.performer_actor_ids || [],
    evaluatorActorIds: row.evaluator_actor_ids || [],
    identityProvenance: row.identity_provenance,
    parentEvidenceIds: row.parent_evidence_ids || [],
    passed: row.passed,
    variantHash: row.variant_hash,
    observedAt: row.observed_at,
    validUntil: row.valid_until,
    independent: row.independent,
    authority: row.authority,
    primarySourceCount: row.primary_source_count ?? undefined,
    protocolFrozen: row.protocol_frozen ?? undefined,
    reproducibleArtifactHash: row.reproducible_artifact_hash,
    replicatedArtifactHash: row.replicated_artifact_hash,
    independentReplication: row.independent_replication ?? undefined,
    critiqueResolved: row.critique_resolved ?? undefined,
    noveltyJudgedIndependent: row.novelty_judged_independent ?? undefined,
  }
}

function mapActor(row: ActorIdentityRow): CosUniversityPhdActorIdentity {
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

function dbOrThrow() {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  return db
}

async function loadEnrollment(programId: CosUniversityPhdProgramId): Promise<CosUniversityProgramEnrollment | null> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
    .eq('agent_id', AGENT_ID)
    .eq('program_key', cosUniversityPhdProgramKey(programId))
    .eq('program_level', 'phd')
    .maybeSingle()
  if (result.error) throw result.error
  return mapEnrollment((result.data || null) as EnrollmentRow | null)
}

async function loadAnyPhdEnrollment(): Promise<CosUniversityProgramEnrollment | null> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
    .eq('agent_id', AGENT_ID)
    .eq('program_level', 'phd')
    .order('enrolled_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  return mapEnrollment((result.data || null) as EnrollmentRow | null)
}

async function loadCredential(programId: CosUniversityPhdProgramId): Promise<CosUniversityCredential | null> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_credentials')
    .select('credential_key,program_key,program_level,title,standing,awarded_at')
    .eq('agent_id', AGENT_ID)
    .eq('credential_key', cosUniversityPhdCredentialKey(AGENT_ID, programId))
    .eq('program_level', 'phd')
    .maybeSingle()
  if (result.error) throw result.error
  return mapCredential((result.data || null) as CredentialRow | null)
}

async function loadCurrentResearchNeed(programId: CosUniversityPhdProgramId, now: Date): Promise<CosUniversityPhdResearchNeed | null> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_research_needs')
    .select('need_key,program_id,justified,reason_code,source_ref,host_authority,observed_at,valid_until')
    .eq('agent_id', AGENT_ID)
    .eq('program_id', programId)
    .eq('justified', true)
    .lte('observed_at', now.toISOString())
    .gt('valid_until', now.toISOString())
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  return mapNeed((result.data || null) as ResearchNeedRow | null)
}

async function loadProjects(programId: CosUniversityPhdProgramId): Promise<CosUniversityPhdProject[]> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_projects')
    .select('project_key,program_id,candidate_actor_id,research_project_id,protocol_id,research_objective,source_ref,opened_at')
    .eq('agent_id', AGENT_ID)
    .eq('program_key', cosUniversityPhdProgramKey(programId))
    .order('opened_at', { ascending: true })
  if (result.error) throw result.error
  return ((result.data || []) as ProjectRow[]).map(mapProject)
}

async function loadEvidenceRows(programId: CosUniversityPhdProgramId): Promise<EvidenceRow[]> {
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_evidence')
    .select(EVIDENCE_SELECT)
    .eq('agent_id', AGENT_ID)
    .eq('program_key', cosUniversityPhdProgramKey(programId))
    .order('observed_at', { ascending: true })
    .limit(10000)
  if (result.error) throw result.error
  return (result.data || []) as unknown as EvidenceRow[]
}

export async function readCosUniversityPhdEvidence(programId: CosUniversityPhdProgramId): Promise<CosUniversityPhdEvidence[]> {
  return (await loadEvidenceRows(programId)).map(mapEvidence)
}

async function loadActorIdentities(actorIds: readonly string[]): Promise<CosUniversityPhdActorIdentity[]> {
  const ids = [...new Set(actorIds.map(id => clean(id, 300)).filter(Boolean))]
  if (!ids.length) return []
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_actor_identities')
    .select('actor_id,actor_role,principal_type,principal_fingerprint,source_ref,valid_from,valid_until')
    .in('actor_id', ids)
  if (result.error) throw result.error
  return ((result.data || []) as ActorIdentityRow[]).map(mapActor)
}

export function cosUniversityPhdActorIdentityEligible(identity: CosUniversityPhdActorIdentity, observedAt: Date): boolean {
  const when = observedAt.getTime()
  const from = validTime(identity.validFrom)
  const until = validTime(identity.validUntil)
  return Number.isFinite(when)
    && from !== null
    && until !== null
    && from <= when
    && when < until
    && Boolean(clean(identity.actorId, 300))
    && Boolean(clean(identity.principalFingerprint, 500))
    && Boolean(clean(identity.sourceRef, 1000))
}

export type CosUniversityPhdPrincipalIndependenceDecision = {
  ok: boolean
  reasons: string[]
}

export function evaluateCosUniversityPhdPrincipalIndependence(
  evidence: readonly CosUniversityPhdEvidence[],
  identities: readonly CosUniversityPhdActorIdentity[],
  graduation: CosUniversityPhdGraduationDecision,
): CosUniversityPhdPrincipalIndependenceDecision {
  if (!graduation.graduated || !graduation.candidateActorId || !graduation.researchProjectId || !graduation.protocolId) {
    return { ok: false, reasons: ['phd_coherent_graduation_required'] }
  }
  const identityByActor = new Map(identities.map(row => [row.actorId, row]))
  const rows = evidence.filter(row =>
    row.programId
    && row.candidateActorId === graduation.candidateActorId
    && row.researchProjectId === graduation.researchProjectId
    && row.protocolId === graduation.protocolId
    && row.passed,
  )
  const allActorIds = [...new Set(rows.flatMap(row => [row.candidateActorId, ...row.performerActorIds, ...row.evaluatorActorIds]))]
  const missing = allActorIds.filter(actorId => !identityByActor.has(actorId))
  if (missing.length) return { ok: false, reasons: ['phd_actor_identity_unresolved'] }

  const candidatePrincipal = identityByActor.get(graduation.candidateActorId)?.principalFingerprint
  if (!candidatePrincipal) return { ok: false, reasons: ['phd_candidate_principal_unresolved'] }

  const pools = new Map<CosUniversityPhdEvidenceStage, Set<string>>()
  for (const stage of CRITICAL_PRINCIPAL_STAGES) {
    const pool = new Set<string>()
    for (const row of rows.filter(item => item.stage === stage)) {
      const actorIds = [...row.evaluatorActorIds, ...(stage === 'independent_replication' ? row.performerActorIds : [])]
      for (const actorId of actorIds) {
        const principal = identityByActor.get(actorId)?.principalFingerprint
        if (!principal) return { ok: false, reasons: ['phd_actor_principal_unresolved'] }
        if (principal === candidatePrincipal) return { ok: false, reasons: ['phd_candidate_principal_not_independent'] }
        pool.add(principal)
      }
    }
    pools.set(stage, pool)
  }

  for (let left = 0; left < CRITICAL_PRINCIPAL_STAGES.length; left += 1) {
    for (let right = left + 1; right < CRITICAL_PRINCIPAL_STAGES.length; right += 1) {
      const leftPool = pools.get(CRITICAL_PRINCIPAL_STAGES[left]) || new Set<string>()
      const rightPool = pools.get(CRITICAL_PRINCIPAL_STAGES[right]) || new Set<string>()
      if ([...leftPool].some(principal => rightPool.has(principal))) {
        return { ok: false, reasons: ['phd_principal_independence_separation_failed'] }
      }
    }
  }
  return { ok: true, reasons: [] }
}

async function actorIndependenceForGraduation(
  evidence: readonly CosUniversityPhdEvidence[],
  graduation: CosUniversityPhdGraduationDecision,
): Promise<CosUniversityPhdPrincipalIndependenceDecision> {
  const actorIds = [...new Set(evidence.flatMap(row => [row.candidateActorId, ...row.performerActorIds, ...row.evaluatorActorIds]))]
  return evaluateCosUniversityPhdPrincipalIndependence(evidence, await loadActorIdentities(actorIds), graduation)
}

export type CosUniversityPhdAdmissionState = {
  mastersCredentialAwarded: boolean
  mastersProgramId: Parameters<typeof evaluateCosUniversityPhdAdmission>[1]['mastersProgramId']
  mastersCredentialStanding: 'A' | 'A+' | null
  currentMastersStanding: 'not_graduated' | 'A' | 'A+'
  currentGeneralistStanding: 'not_graduated' | 'A' | 'A+'
  researchNeedJustified: boolean
  researchNeed: CosUniversityPhdResearchNeed | null
}

export async function readCosUniversityPhdAdmissionState(
  programId: CosUniversityPhdProgramId,
  now = new Date(),
): Promise<CosUniversityPhdAdmissionState> {
  const program = COS_UNIVERSITY_PHD_PROGRAMS[programId]
  const [masters, researchNeed] = await Promise.all([
    readCosUniversityMastersRuntimeStatus(program.mastersPrerequisite, now),
    loadCurrentResearchNeed(programId, now),
  ])
  return {
    mastersCredentialAwarded: Boolean(masters.credential),
    mastersProgramId: program.mastersPrerequisite,
    mastersCredentialStanding: masters.credentialStanding,
    currentMastersStanding: masters.currentCompetenceStanding,
    currentGeneralistStanding: masters.currentGeneralistStanding,
    researchNeedJustified: Boolean(researchNeed?.justified),
    researchNeed,
  }
}

export type CosUniversityPhdRuntimeStatus = {
  agentId: 'cos'
  programId: CosUniversityPhdProgramId
  programKey: string
  title: string
  admission: CosUniversityPhdAdmissionDecision
  researchNeed: CosUniversityPhdResearchNeed | null
  enrollment: CosUniversityProgramEnrollment | null
  timingStatus: CosUniversityProgramTimingStatus | 'graduated'
  credential: CosUniversityCredential | null
  projects: CosUniversityPhdProject[]
  evidenceRows: number
  candidateActorId: string | null
  graduation: CosUniversityPhdGraduationDecision
  principalIndependence: CosUniversityPhdPrincipalIndependenceDecision
  currentCompetenceStanding: 'not_graduated' | 'A' | 'A+'
  awardEligible: boolean
  authorityExpanded: false
  semantics: 'host_identity_research_need_time_bounded_phd_immutable_credential'
}

export async function readCosUniversityPhdRuntimeStatus(
  programId: CosUniversityPhdProgramId,
  now = new Date(),
): Promise<CosUniversityPhdRuntimeStatus> {
  const program = COS_UNIVERSITY_PHD_PROGRAMS[programId]
  const programKey = cosUniversityPhdProgramKey(programId)
  const admissionState = await readCosUniversityPhdAdmissionState(programId, now)
  const admission = evaluateCosUniversityPhdAdmission(programId, admissionState)
  const [enrollment, credential, projects, evidence] = await Promise.all([
    loadEnrollment(programId),
    loadCredential(programId),
    loadProjects(programId),
    readCosUniversityPhdEvidence(programId),
  ])
  const candidateActorIds = [...new Set(projects.map(row => row.candidateActorId))]
  const candidateActorId = candidateActorIds.length === 1 ? candidateActorIds[0] : null
  const graduation = evaluateCosUniversityPhdGraduation(programId, candidateActorId || '', evidence, now)
  const principalIndependence = graduation.graduated
    ? await actorIndependenceForGraduation(evidence, graduation)
    : { ok: false, reasons: ['phd_coherent_graduation_required'] }
  const rawTiming = cosUniversityProgramTimingStatus(enrollment, now)
  const awardEligible = !credential
    && admission.admitted
    && cosUniversityProgramMayGraduate(enrollment, now)
    && graduation.graduated
    && principalIndependence.ok

  return {
    agentId: AGENT_ID,
    programId,
    programKey,
    title: program.title,
    admission,
    researchNeed: admissionState.researchNeed,
    enrollment,
    timingStatus: credential ? 'graduated' : rawTiming,
    credential,
    projects,
    evidenceRows: evidence.length,
    candidateActorId,
    graduation,
    principalIndependence,
    currentCompetenceStanding: graduation.standing,
    awardEligible,
    authorityExpanded: false,
    semantics: 'host_identity_research_need_time_bounded_phd_immutable_credential',
  }
}

export async function ensureCosUniversityPhdEnrollment(
  programId: CosUniversityPhdProgramId,
  now = new Date(),
): Promise<{ enrolled: boolean; state: 'enrolled' | 'already_enrolled' | 'already_graduated' | 'admission_denied' | 'error'; status: CosUniversityPhdRuntimeStatus | null; reasons: string[] }> {
  const before = await readCosUniversityPhdRuntimeStatus(programId, now)
  if (before.credential) return { enrolled: false, state: 'already_graduated', status: before, reasons: [] }
  if (!before.admission.admitted) return { enrolled: false, state: 'admission_denied', status: before, reasons: before.admission.reasons }
  if (before.enrollment) return { enrolled: false, state: 'already_enrolled', status: before, reasons: [] }
  const existing = await loadAnyPhdEnrollment()
  if (existing && existing.programKey !== before.programKey) {
    return { enrolled: false, state: 'admission_denied', status: before, reasons: ['already_enrolled_at_next_level'] }
  }

  const enrollment = buildCosUniversityProgramEnrollment({ programKey: before.programKey, level: 'phd', enrolledAt: now })
  const db = dbOrThrow()
  const result = await db.from('cos_university_program_enrollments').insert({
    agent_id: AGENT_ID,
    program_key: enrollment.programKey,
    program_level: 'phd',
    enrolled_at: enrollment.enrolledAt,
    minimum_residence_until: enrollment.minimumResidenceUntil,
    target_completion_at: enrollment.targetCompletionAt,
    hard_deadline_at: enrollment.hardDeadlineAt,
  })
  if (result.error && String((result.error as { code?: string }).code || '') !== '23505') {
    return { enrolled: false, state: 'error', status: before, reasons: [result.error.message] }
  }
  const after = await readCosUniversityPhdRuntimeStatus(programId, now)
  return { enrolled: Boolean(after.enrollment), state: after.enrollment ? 'enrolled' : 'error', status: after, reasons: after.enrollment ? [] : ['phd_enrollment_not_persisted'] }
}

export async function recordHostCosUniversityPhdActorIdentity(input: {
  actorId: string
  actorRole: CosUniversityPhdActorRole
  principalType: CosUniversityPhdActorIdentity['principalType']
  principalFingerprint: string
  sourceRef: string
  validFrom?: Date
  validityDays?: number
}): Promise<boolean> {
  const actorId = clean(input.actorId, 300)
  const principalFingerprint = clean(input.principalFingerprint, 500)
  const sourceRef = clean(input.sourceRef, 1000)
  const validFrom = input.validFrom instanceof Date ? input.validFrom : new Date()
  if (!actorId || !principalFingerprint || !sourceRef || !Number.isFinite(validFrom.getTime())) return false
  const validityDays = Math.max(1, Math.min(3650, Math.floor(input.validityDays || 730)))
  const validUntil = new Date(validFrom.getTime() + validityDays * 86_400_000)
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_actor_identities').insert({
    actor_id: actorId,
    actor_role: input.actorRole,
    principal_type: input.principalType,
    principal_fingerprint: principalFingerprint,
    source_ref: sourceRef,
    valid_from: validFrom.toISOString(),
    valid_until: validUntil.toISOString(),
  })
  if (!result.error) return true
  if (String((result.error as { code?: string }).code || '') !== '23505') throw result.error
  const existing = await loadActorIdentities([actorId])
  return existing.some(row => row.actorId === actorId
    && row.actorRole === input.actorRole
    && row.principalType === input.principalType
    && row.principalFingerprint === principalFingerprint
    && row.sourceRef === sourceRef)
}

export async function recordHostCosUniversityPhdResearchNeed(input: {
  programId: CosUniversityPhdProgramId
  reasonCode: CosUniversityPhdResearchNeedReason
  sourceRef: string
  observedAt?: Date
  validityDays?: number
  evidenceSnapshot?: Record<string, unknown>
}): Promise<boolean> {
  const observedAt = input.observedAt instanceof Date ? input.observedAt : new Date()
  const sourceRef = clean(input.sourceRef, 1000)
  if (!COS_UNIVERSITY_PHD_PROGRAMS[input.programId] || !sourceRef || !Number.isFinite(observedAt.getTime())) return false
  const validityDays = Math.max(1, Math.min(730, Math.floor(input.validityDays || 180)))
  const needKey = createHash('sha256').update(`${AGENT_ID}|${input.programId}|${input.reasonCode}|${sourceRef}|${observedAt.toISOString()}`).digest('hex')
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_research_needs').insert({
    need_key: needKey,
    agent_id: AGENT_ID,
    program_id: input.programId,
    justified: true,
    reason_code: input.reasonCode,
    source_ref: sourceRef,
    host_authority: 'university_research_strategy',
    observed_at: observedAt.toISOString(),
    valid_until: new Date(observedAt.getTime() + validityDays * 86_400_000).toISOString(),
    evidence_snapshot: input.evidenceSnapshot || {},
  })
  if (!result.error) return true
  if (String((result.error as { code?: string }).code || '') === '23505') return true
  throw result.error
}

export async function recordHostCosUniversityPhdProject(input: {
  programId: CosUniversityPhdProgramId
  candidateActorId: string
  researchProjectId: string
  protocolId: string
  researchObjective: string
  sourceRef: string
  openedAt?: Date
}): Promise<boolean> {
  const openedAt = input.openedAt instanceof Date ? input.openedAt : new Date()
  const candidateActorId = clean(input.candidateActorId, 300)
  const researchProjectId = clean(input.researchProjectId, 300)
  const protocolId = clean(input.protocolId, 300)
  const researchObjective = clean(input.researchObjective, 4000)
  const sourceRef = clean(input.sourceRef, 1000)
  if (!candidateActorId || !researchProjectId || !protocolId || !researchObjective || !sourceRef || !Number.isFinite(openedAt.getTime())) return false
  const status = await readCosUniversityPhdRuntimeStatus(input.programId, openedAt)
  if (!status.enrollment || status.credential || status.timingStatus === 'deadline_expired') return false
  const actor = (await loadActorIdentities([candidateActorId])).find(row => row.actorId === candidateActorId)
  if (!actor || actor.actorRole !== 'candidate' || !cosUniversityPhdActorIdentityEligible(actor, openedAt)) return false
  const projectKey = createHash('sha256').update(`${AGENT_ID}|${input.programId}|${candidateActorId}|${researchProjectId}|${protocolId}`).digest('hex')
  const db = dbOrThrow()
  const result = await db.from('cos_university_phd_projects').insert({
    project_key: projectKey,
    agent_id: AGENT_ID,
    program_key: status.programKey,
    program_id: input.programId,
    candidate_actor_id: candidateActorId,
    research_project_id: researchProjectId,
    protocol_id: protocolId,
    research_objective: researchObjective,
    source_ref: sourceRef,
    opened_at: openedAt.toISOString(),
  })
  if (!result.error) return true
  if (String((result.error as { code?: string }).code || '') === '23505') return true
  throw result.error
}

async function projectForEvidence(programId: CosUniversityPhdProgramId, evidence: CosUniversityPhdEvidence): Promise<CosUniversityPhdProject | null> {
  const projects = await loadProjects(programId)
  return projects.find(project => project.candidateActorId === evidence.candidateActorId
    && project.researchProjectId === evidence.researchProjectId
    && project.protocolId === evidence.protocolId) ?? null
}

async function evidenceActorsResolve(evidence: CosUniversityPhdEvidence, observedAt: Date): Promise<boolean> {
  const actorIds = [...new Set([evidence.candidateActorId, ...evidence.performerActorIds, ...evidence.evaluatorActorIds])]
  const identities = await loadActorIdentities(actorIds)
  if (identities.length !== actorIds.length) return false
  return identities.every(identity => cosUniversityPhdActorIdentityEligible(identity, observedAt))
}

function failureStructurallyEligible(evidence: CosUniversityPhdEvidence, now: Date): boolean {
  const observed = validTime(evidence.observedAt)
  const validUntil = validTime(evidence.validUntil)
  return !evidence.passed
    && observed !== null
    && validUntil !== null
    && observed <= now.getTime()
    && validUntil > observed
    && evidence.independent
    && evidence.authority === cosUniversityPhdExpectedAuthority(evidence.stage)
    && evidence.identityProvenance === PHD_IDENTITY_PROVENANCE
    && Boolean(clean(evidence.evidenceId, 300))
    && Boolean(clean(evidence.researchProjectId, 300))
    && Boolean(clean(evidence.protocolId, 300))
    && Boolean(clean(evidence.candidateActorId, 300))
    && evidence.performerActorIds.length > 0
    && evidence.evaluatorActorIds.length > 0
}

export async function recordHostCosUniversityPhdEvidence(input: {
  evidenceKey: string
  evidence: CosUniversityPhdEvidence
  sourceRef: string
  scorerVersion?: string | null
  evidenceSnapshot?: Record<string, unknown>
}): Promise<boolean> {
  const evidenceKey = clean(input.evidenceKey, 500)
  const sourceRef = clean(input.sourceRef, 1000)
  const evidence = input.evidence
  const observedAt = new Date(evidence.observedAt)
  if (!evidenceKey || !sourceRef || !Number.isFinite(observedAt.getTime())) return false
  if (observedAt.getTime() > Date.now() + MAX_FUTURE_CLOCK_SKEW_MS) return false
  const status = await readCosUniversityPhdRuntimeStatus(evidence.programId, observedAt)
  if (!status.enrollment || status.credential || status.timingStatus === 'deadline_expired' || status.timingStatus === 'not_enrolled') return false
  if (observedAt.getTime() < Date.parse(status.enrollment.enrolledAt)) return false
  const project = await projectForEvidence(evidence.programId, evidence)
  if (!project || observedAt.getTime() < Date.parse(project.openedAt)) return false
  if (!(await evidenceActorsResolve(evidence, observedAt))) return false
  if (evidence.passed ? !cosUniversityPhdEvidenceEligible(evidence, observedAt) : !failureStructurallyEligible(evidence, observedAt)) return false

  const db = dbOrThrow()
  if (evidence.passed && evidence.parentEvidenceIds?.length) {
    const parents = await db.from('cos_university_phd_evidence')
      .select('evidence_id,research_project_id,protocol_id,candidate_actor_id')
      .eq('agent_id', AGENT_ID)
      .eq('program_key', status.programKey)
      .in('evidence_id', [...evidence.parentEvidenceIds])
    if (parents.error) throw parents.error
    const parentRows = (parents.data || []) as Array<{ evidence_id: string; research_project_id: string; protocol_id: string; candidate_actor_id: string }>
    if (parentRows.length !== new Set(evidence.parentEvidenceIds).size) return false
    if (parentRows.some(row => row.research_project_id !== evidence.researchProjectId
      || row.protocol_id !== evidence.protocolId
      || row.candidate_actor_id !== evidence.candidateActorId)) return false
  }

  const result = await db.from('cos_university_phd_evidence').insert({
    evidence_key: evidenceKey,
    evidence_id: evidence.evidenceId,
    agent_id: AGENT_ID,
    program_key: status.programKey,
    program_id: evidence.programId,
    stage: evidence.stage,
    research_project_id: evidence.researchProjectId,
    protocol_id: evidence.protocolId,
    candidate_actor_id: evidence.candidateActorId,
    performer_actor_ids: [...evidence.performerActorIds],
    evaluator_actor_ids: [...evidence.evaluatorActorIds],
    identity_provenance: evidence.identityProvenance,
    parent_evidence_ids: [...(evidence.parentEvidenceIds || [])],
    passed: evidence.passed,
    variant_hash: evidence.variantHash,
    independent: evidence.independent,
    authority: evidence.authority,
    primary_source_count: evidence.primarySourceCount ?? null,
    protocol_frozen: evidence.protocolFrozen ?? null,
    reproducible_artifact_hash: evidence.reproducibleArtifactHash ?? null,
    replicated_artifact_hash: evidence.replicatedArtifactHash ?? null,
    independent_replication: evidence.independentReplication ?? null,
    critique_resolved: evidence.critiqueResolved ?? null,
    novelty_judged_independent: evidence.noveltyJudgedIndependent ?? null,
    source_ref: sourceRef,
    scorer_version: input.scorerVersion || null,
    observed_at: evidence.observedAt,
    valid_until: evidence.validUntil,
    evidence_snapshot: input.evidenceSnapshot || {},
  })
  if (!result.error) return true
  if (String((result.error as { code?: string }).code || '') === '23505') return true
  throw result.error
}

export function cosUniversityPhdShouldAwardNow(status: Pick<CosUniversityPhdRuntimeStatus, 'awardEligible' | 'graduation' | 'timingStatus'>): boolean {
  if (!status.awardEligible) return false
  if (status.graduation.standing === 'A+' ) return true
  return status.graduation.standing === 'A' && status.timingStatus === 'target_date_passed'
}

export async function evaluateAndAwardCosUniversityPhdCredential(
  programId: CosUniversityPhdProgramId,
  now = new Date(),
): Promise<{ awarded: boolean; state: 'credential_awarded' | 'already_graduated' | 'not_eligible' | 'error'; status: CosUniversityPhdRuntimeStatus | null; reasons: string[] }> {
  const before = await readCosUniversityPhdRuntimeStatus(programId, now)
  if (before.credential) return { awarded: false, state: 'already_graduated', status: before, reasons: [] }
  if (!cosUniversityPhdShouldAwardNow(before) || !before.enrollment) {
    const reasons = [
      ...before.admission.reasons,
      ...before.graduation.blockers,
      ...before.principalIndependence.reasons,
      ...(before.timingStatus === 'minimum_residence' ? ['minimum_residence_incomplete'] : []),
      ...(before.timingStatus === 'deadline_expired' ? ['phd_program_deadline_expired'] : []),
      ...(before.timingStatus === 'not_enrolled' ? ['phd_program_not_enrolled'] : []),
      ...(before.graduation.standing === 'A' && before.timingStatus !== 'target_date_passed' ? ['phd_A_plus_pursuit_active_until_target_date'] : []),
    ]
    return { awarded: false, state: 'not_eligible', status: before, reasons: [...new Set(reasons)] }
  }

  const db = dbOrThrow()
  const program = COS_UNIVERSITY_PHD_PROGRAMS[programId]
  const result = await db.from('cos_university_credentials').insert({
    credential_key: cosUniversityPhdCredentialKey(AGENT_ID, programId),
    agent_id: AGENT_ID,
    program_key: before.programKey,
    program_level: 'phd',
    title: program.title,
    standing: before.graduation.standing,
    awarded_at: now.toISOString(),
    evidence_snapshot: {
      issuedBy: 'host_phd_graduation_gate',
      programId,
      candidateActorId: before.graduation.candidateActorId,
      researchProjectId: before.graduation.researchProjectId,
      protocolId: before.graduation.protocolId,
      evidenceRows: before.evidenceRows,
      principalIndependence: before.principalIndependence,
      programTimingStatus: before.timingStatus,
      authorityExpanded: false,
    },
  })
  if (result.error && String((result.error as { code?: string }).code || '') !== '23505') {
    return { awarded: false, state: 'error', status: before, reasons: [result.error.message] }
  }
  const after = await readCosUniversityPhdRuntimeStatus(programId, now)
  return {
    awarded: Boolean(after.credential),
    state: after.credential ? 'credential_awarded' : 'error',
    status: after,
    reasons: after.credential ? [] : ['phd_credential_not_persisted'],
  }
}

export async function runCosUniversityPhdAdmission(now = new Date()): Promise<{
  checked: number
  enrolled: boolean
  programId: CosUniversityPhdProgramId | null
  errors: string[]
}> {
  const ids = Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[]
  const errors: string[] = []
  for (const programId of ids) {
    try {
      const result = await ensureCosUniversityPhdEnrollment(programId, now)
      if (result.state === 'enrolled' || result.state === 'already_enrolled' || result.state === 'already_graduated') {
        return { checked: ids.indexOf(programId) + 1, enrolled: result.state !== 'already_graduated', programId, errors }
      }
    } catch (error) {
      errors.push(`${programId}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { checked: ids.length, enrolled: false, programId: null, errors }
}

export async function runCosUniversityPhdProgress(now = new Date()): Promise<{
  checked: number
  awarded: boolean
  programId: CosUniversityPhdProgramId | null
  errors: string[]
}> {
  const ids = Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[]
  const errors: string[] = []
  for (const programId of ids) {
    try {
      const status = await readCosUniversityPhdRuntimeStatus(programId, now)
      if (!status.enrollment && !status.credential) continue
      const result = await evaluateAndAwardCosUniversityPhdCredential(programId, now)
      return { checked: ids.indexOf(programId) + 1, awarded: result.awarded, programId, errors: [...errors, ...(result.state === 'error' ? result.reasons : [])] }
    } catch (error) {
      errors.push(`${programId}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { checked: ids.length, awarded: false, programId: null, errors }
}

export const COS_UNIVERSITY_PHD_RUNTIME_DEFAULT_VALIDITY_DAYS = DEFAULT_VALIDITY_DAYS
