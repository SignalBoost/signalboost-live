import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  academicStateFromRows,
  type CosUniversityAssessmentRow,
} from './cosUniversityAcademicState.ts'
import { readCosUniversityGeneralistGraduationStatus } from './cosUniversityGraduationRunner.ts'
import {
  buildCosUniversityProgramEnrollment,
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
  type CosUniversityProgramTimingStatus,
} from './cosUniversityPrograms.ts'
import type { CosUniversityCredential } from './cosUniversityCredentials.ts'
import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  cosUniversityMastersCredentialKey,
  cosUniversityMastersExpectedAuthority,
  cosUniversityMastersProgramKey,
  evaluateCosUniversityMastersAdmission,
  evaluateCosUniversityMastersGraduation,
  type CosUniversityMastersAdmissionDecision,
  type CosUniversityMastersEvidence,
  type CosUniversityMastersEvidenceAuthority,
  type CosUniversityMastersEvidenceStage,
  type CosUniversityMastersGraduationDecision,
  type CosUniversityMastersProgramId,
} from './cosUniversityMasters.ts'
import type { CosUniversitySubjectId } from './cosUniversity.ts'

const AGENT_ID = 'cos'
const ASSESSMENT_SELECT = 'assessment_key,subject_id,language_code,language_dimension,assessment_kind,passed,independent_scorer,scorer_version,scorer_authority,observed_at,valid_until'
const EVIDENCE_SELECT = 'evidence_key,program_id,stage,passed,variant_hash,independent,verified_practical,authority,observed_at,valid_until'

type EnrollmentRow = {
  program_key: string
  program_level: 'masters'
  enrolled_at: string
  minimum_residence_until: string
  target_completion_at: string
  hard_deadline_at: string
}

type CredentialRow = {
  credential_key: string
  program_key: string
  program_level: 'masters'
  title: string
  standing: 'A' | 'A+'
  awarded_at: string
}

type MastersEvidenceRow = {
  evidence_key: string
  program_id: CosUniversityMastersProgramId
  stage: CosUniversityMastersEvidenceStage
  passed: boolean
  variant_hash: string
  independent: boolean
  verified_practical: boolean
  authority: CosUniversityMastersEvidenceAuthority
  observed_at: string
  valid_until: string
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

function mapEvidence(row: MastersEvidenceRow): CosUniversityMastersEvidence {
  return {
    programId: row.program_id,
    stage: row.stage,
    passed: row.passed,
    variantHash: row.variant_hash,
    observedAt: row.observed_at,
    validUntil: row.valid_until,
    independent: row.independent,
    authority: row.authority,
    verifiedPractical: row.verified_practical,
  }
}

async function loadAssessmentRows(): Promise<CosUniversityAssessmentRow[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_assessments')
    .select(ASSESSMENT_SELECT)
    .eq('agent_id', AGENT_ID)
    .order('observed_at', { ascending: false })
    .limit(10000)
  if (result.error) throw result.error
  return (result.data || []) as CosUniversityAssessmentRow[]
}

async function loadEnrollment(programKey: string): Promise<CosUniversityProgramEnrollment | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
    .eq('agent_id', AGENT_ID)
    .eq('program_key', programKey)
    .eq('program_level', 'masters')
    .maybeSingle()
  if (result.error) throw result.error
  return mapEnrollment((result.data || null) as EnrollmentRow | null)
}

async function loadAnyMastersEnrollment(): Promise<CosUniversityProgramEnrollment | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
    .eq('agent_id', AGENT_ID)
    .eq('program_level', 'masters')
    .order('enrolled_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  return mapEnrollment((result.data || null) as EnrollmentRow | null)
}

async function loadCredential(programId: CosUniversityMastersProgramId): Promise<CosUniversityCredential | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_credentials')
    .select('credential_key,program_key,program_level,title,standing,awarded_at')
    .eq('agent_id', AGENT_ID)
    .eq('credential_key', cosUniversityMastersCredentialKey(AGENT_ID, programId))
    .eq('program_level', 'masters')
    .maybeSingle()
  if (result.error) throw result.error
  return mapCredential((result.data || null) as CredentialRow | null)
}

async function loadEvidence(programKey: string): Promise<MastersEvidenceRow[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_masters_evidence')
    .select(EVIDENCE_SELECT)
    .eq('agent_id', AGENT_ID)
    .eq('program_key', programKey)
    .order('observed_at', { ascending: true })
    .limit(5000)
  if (result.error) throw result.error
  return (result.data || []) as MastersEvidenceRow[]
}

async function currentAdmissionInput(now: Date): Promise<{
  decisionByProgram: Partial<Record<CosUniversityMastersProgramId, CosUniversityMastersAdmissionDecision>>
  undergraduateCredentialAwarded: boolean
  currentGeneralistStanding: 'not_graduated' | 'A' | 'A+'
  currentSubjectStanding: Partial<Record<CosUniversitySubjectId, string>>
}> {
  const [generalist, assessmentRows] = await Promise.all([
    readCosUniversityGeneralistGraduationStatus(now),
    loadAssessmentRows(),
  ])
  const academic = academicStateFromRows(assessmentRows, now)
  const currentSubjectStanding: Partial<Record<CosUniversitySubjectId, string>> = {}
  for (const row of academic.subjectTranscript) currentSubjectStanding[row.subjectId] = row.grade
  return {
    decisionByProgram: {},
    undergraduateCredentialAwarded: Boolean(generalist.credential),
    currentGeneralistStanding: generalist.currentCompetenceStanding,
    currentSubjectStanding,
  }
}

export type CosUniversityMastersRuntimeStatus = {
  agentId: 'cos'
  programId: CosUniversityMastersProgramId
  programKey: string
  title: string
  admission: CosUniversityMastersAdmissionDecision
  currentGeneralistStanding: 'not_graduated' | 'A' | 'A+'
  currentPrimarySubjectStanding: Partial<Record<CosUniversitySubjectId, string>>
  enrollment: CosUniversityProgramEnrollment | null
  timingStatus: CosUniversityProgramTimingStatus | 'graduated'
  credential: CosUniversityCredential | null
  graduated: boolean
  credentialStanding: 'A' | 'A+' | null
  currentCompetenceStanding: 'not_graduated' | 'A' | 'A+'
  evidenceRows: number
  graduation: CosUniversityMastersGraduationDecision
  awardEligible: boolean
  authorityExpanded: false
  semantics: 'host_admission_time_bounded_masters_immutable_credential_current_competence_separate'
}

export async function readCosUniversityMastersRuntimeStatus(
  programId: CosUniversityMastersProgramId,
  now = new Date(),
): Promise<CosUniversityMastersRuntimeStatus> {
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const programKey = cosUniversityMastersProgramKey(programId)
  const admissionInput = await currentAdmissionInput(now)
  const admission = evaluateCosUniversityMastersAdmission(programId, admissionInput)
  const [enrollment, credential, evidenceRows] = await Promise.all([
    loadEnrollment(programKey),
    loadCredential(programId),
    loadEvidence(programKey),
  ])
  const evidence = evidenceRows.map(mapEvidence)
  const graduation = evaluateCosUniversityMastersGraduation(programId, evidence, now)
  const rawTiming = cosUniversityProgramTimingStatus(enrollment, now)
  const awardEligible = !credential
    && admission.admitted
    && cosUniversityProgramMayGraduate(enrollment, now)
    && graduation.graduated

  const currentPrimarySubjectStanding: Partial<Record<CosUniversitySubjectId, string>> = {}
  for (const subjectId of program.primarySubjects) {
    currentPrimarySubjectStanding[subjectId] = admissionInput.currentSubjectStanding[subjectId]
  }

  return {
    agentId: AGENT_ID,
    programId,
    programKey,
    title: program.title,
    admission,
    currentGeneralistStanding: admissionInput.currentGeneralistStanding,
    currentPrimarySubjectStanding,
    enrollment,
    timingStatus: credential ? 'graduated' : rawTiming,
    credential,
    graduated: Boolean(credential),
    credentialStanding: credential?.standing ?? null,
    currentCompetenceStanding: graduation.standing,
    evidenceRows: evidenceRows.length,
    graduation,
    awardEligible,
    authorityExpanded: false,
    semantics: 'host_admission_time_bounded_masters_immutable_credential_current_competence_separate',
  }
}

export type CosUniversityMastersEnrollmentResult = {
  enrolled: boolean
  state: 'enrolled' | 'already_enrolled' | 'already_graduated' | 'admission_denied' | 'error'
  status: CosUniversityMastersRuntimeStatus | null
  reasons: string[]
}

export async function ensureCosUniversityMastersEnrollment(
  programId: CosUniversityMastersProgramId,
  now = new Date(),
): Promise<CosUniversityMastersEnrollmentResult> {
  const before = await readCosUniversityMastersRuntimeStatus(programId, now)
  if (before.credential) return { enrolled: false, state: 'already_graduated', status: before, reasons: [] }
  if (!before.admission.admitted) return { enrolled: false, state: 'admission_denied', status: before, reasons: before.admission.reasons }
  if (before.enrollment) return { enrolled: false, state: 'already_enrolled', status: before, reasons: [] }

  const existingMasters = await loadAnyMastersEnrollment()
  if (existingMasters && existingMasters.programKey !== before.programKey) {
    return { enrolled: false, state: 'admission_denied', status: before, reasons: ['already_enrolled_at_next_level'] }
  }

  const db = cosServiceDb()
  if (!db) return { enrolled: false, state: 'error', status: null, reasons: ['service_database_unavailable'] }
  const enrollment = buildCosUniversityProgramEnrollment({
    programKey: before.programKey,
    level: 'masters',
    enrolledAt: now,
  })
  const insert = await db.from('cos_university_program_enrollments').insert({
    agent_id: AGENT_ID,
    program_key: enrollment.programKey,
    program_level: enrollment.programLevel,
    enrolled_at: enrollment.enrolledAt,
    minimum_residence_until: enrollment.minimumResidenceUntil,
    target_completion_at: enrollment.targetCompletionAt,
    hard_deadline_at: enrollment.hardDeadlineAt,
  })
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') {
    return { enrolled: false, state: 'error', status: before, reasons: [insert.error.message] }
  }
  const after = await readCosUniversityMastersRuntimeStatus(programId, now)
  return { enrolled: Boolean(after.enrollment), state: after.enrollment ? 'enrolled' : 'error', status: after, reasons: after.enrollment ? [] : ['enrollment_not_persisted'] }
}

export type RecordCosUniversityMastersEvidenceInput = {
  programId: CosUniversityMastersProgramId
  evidenceKey: string
  stage: CosUniversityMastersEvidenceStage
  passed: boolean
  variantHash: string
  authority: CosUniversityMastersEvidenceAuthority
  sourceRef: string
  scorerVersion?: string | null
  observedAt?: Date
  validityDays?: number
  evidenceSnapshot?: Record<string, unknown>
}

/**
 * Host-only academic write seam. It is intentionally not exposed by the owner/browser API.
 * The caller supplies a host scorer/Production outcome verdict; this function enforces program state,
 * stage authority, independence, practical verification and an immutable service-role ledger.
 */
export async function recordHostCosUniversityMastersEvidence(
  input: RecordCosUniversityMastersEvidenceInput,
): Promise<boolean> {
  const now = input.observedAt instanceof Date ? input.observedAt : new Date()
  if (!Number.isFinite(now.getTime())) return false
  if (input.authority !== cosUniversityMastersExpectedAuthority(input.stage)) return false
  const status = await readCosUniversityMastersRuntimeStatus(input.programId, now)
  if (!status.enrollment || status.credential) return false
  if (status.timingStatus === 'deadline_expired' || status.timingStatus === 'not_enrolled') return false

  const evidenceKey = String(input.evidenceKey || '').trim()
  const variantHash = String(input.variantHash || '').trim()
  const sourceRef = String(input.sourceRef || '').trim()
  if (!evidenceKey || !variantHash || !sourceRef) return false
  const validityDays = Math.max(1, Math.min(730, Math.floor(input.validityDays || 365)))
  const validUntil = new Date(now.getTime() + validityDays * 86_400_000)
  const independent = input.stage !== 'graduate_coursework'
  const verifiedPractical = input.stage === 'verified_practical_work'

  const db = cosServiceDb()
  if (!db) return false
  const insert = await db.from('cos_university_masters_evidence').insert({
    evidence_key: evidenceKey,
    agent_id: AGENT_ID,
    program_key: status.programKey,
    program_id: input.programId,
    stage: input.stage,
    passed: input.passed,
    variant_hash: variantHash,
    independent,
    verified_practical: verifiedPractical,
    authority: input.authority,
    source_ref: sourceRef,
    scorer_version: input.scorerVersion || null,
    observed_at: now.toISOString(),
    valid_until: validUntil.toISOString(),
    evidence_snapshot: input.evidenceSnapshot || {},
  })
  if (!insert.error) return true
  if (String((insert.error as { code?: string }).code || '') === '23505') return true
  throw insert.error
}

export type CosUniversityMastersCredentialResult = {
  awarded: boolean
  state: 'credential_awarded' | 'already_graduated' | 'not_eligible' | 'error'
  status: CosUniversityMastersRuntimeStatus | null
  reasons: string[]
}

export async function evaluateAndAwardCosUniversityMastersCredential(
  programId: CosUniversityMastersProgramId,
  now = new Date(),
): Promise<CosUniversityMastersCredentialResult> {
  const before = await readCosUniversityMastersRuntimeStatus(programId, now)
  if (before.credential) return { awarded: false, state: 'already_graduated', status: before, reasons: [] }
  if (!before.awardEligible || !before.enrollment || before.graduation.standing === 'not_graduated') {
    const reasons = [
      ...before.admission.reasons,
      ...before.graduation.blockers,
      ...(before.timingStatus === 'minimum_residence' ? ['minimum_residence_incomplete'] : []),
      ...(before.timingStatus === 'deadline_expired' ? ['masters_program_deadline_expired'] : []),
      ...(before.timingStatus === 'not_enrolled' ? ['masters_program_not_enrolled'] : []),
    ]
    return { awarded: false, state: 'not_eligible', status: before, reasons: [...new Set(reasons)] }
  }

  const db = cosServiceDb()
  if (!db) return { awarded: false, state: 'error', status: before, reasons: ['service_database_unavailable'] }
  const program = COS_UNIVERSITY_MASTERS_PROGRAMS[programId]
  const insert = await db.from('cos_university_credentials').insert({
    credential_key: cosUniversityMastersCredentialKey(AGENT_ID, programId),
    agent_id: AGENT_ID,
    program_key: before.programKey,
    program_level: 'masters',
    title: program.title,
    standing: before.graduation.standing,
    awarded_at: now.toISOString(),
    evidence_snapshot: {
      issuedBy: 'host_masters_graduation_gate',
      programId,
      evidenceRows: before.evidenceRows,
      currentGeneralistStanding: before.currentGeneralistStanding,
      currentPrimarySubjectStanding: before.currentPrimarySubjectStanding,
      programTimingStatus: before.timingStatus,
      authorityExpanded: false,
    },
  })
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') {
    return { awarded: false, state: 'error', status: before, reasons: [insert.error.message] }
  }
  const after = await readCosUniversityMastersRuntimeStatus(programId, now)
  return {
    awarded: Boolean(after.credential),
    state: after.credential ? 'credential_awarded' : 'error',
    status: after,
    reasons: after.credential ? [] : ['credential_not_persisted'],
  }
}
