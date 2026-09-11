import { randomUUID } from 'node:crypto'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  academicStateFromRows,
  type CosUniversityAcademicState,
  type CosUniversityAssessmentRow,
} from './cosUniversityAcademicState.ts'
import {
  COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE,
  COS_UNIVERSITY_GENERALIST_CAPSTONE_SCORER,
  buildCosUniversityGeneralistCapstoneExam,
  deriveCosUniversityGeneralistGraduation,
  scoreCosUniversityGeneralistCapstoneExam,
  type CosUniversityGeneralistCapstoneRunEvidence,
} from './cosUniversityGraduation.ts'
import {
  applyCosUniversityUndergraduateCalendar,
  type CosUniversityTimeBoundedGraduationStatus,
} from './cosUniversityProgramGate.ts'
import type { CosUniversityProgramEnrollment } from './cosUniversityPrograms.ts'
import {
  COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_TITLE,
  cosUniversityGeneralistUndergraduateCredentialKey,
  type CosUniversityCredential,
} from './cosUniversityCredentials.ts'

import {
  cosUniversityGraduationRuntimeBlocker,
  isCosUniversityGraduationExecutionEvidence,
  requireCosUniversityGraduationRuntime,
} from './cosUniversityGraduationRuntimePolicy.ts'

import {
  applyCosUniversityGraduationRemediation,
  parseCosUniversityGraduationRemediation,
  type CosUniversityGraduationRemediation,
} from './cosUniversityGraduationRemediation.ts'

export type CosUniversityRemediationGraduationStatus = CosUniversityTimeBoundedGraduationStatus & {
  remediation: CosUniversityGraduationRemediation | null
}

const AGENT_ID = 'cos'
const UNDERGRADUATE_PROGRAM_KEY = 'generalist_undergraduate_v1'

/** COS keeps its historical capstone run keys; every other agent is namespaced so ledgers never collide. */
export function cosUniversityGeneralistCapstoneRunKey(agentId: string, day: string): string {
  return agentId === AGENT_ID
    ? `${COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE}:${day}`
    : `${COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE}:${agentId}:${day}`
}

type GeneralistCapstoneRunRow = {
  id: string
  run_key: string
  agent_id: string
  profile: string
  scorer_version: string
  seed: string
  manifest_hash: string
  variant_hash: string
  status: 'created' | 'running' | 'passed' | 'failed' | 'error'
  passed: boolean | null
  turn_id: string | null
  response_source: string | null
  local_model_invoked: boolean
  external_ai_invoked: boolean
  fresh_execution: boolean
  reasons: string[] | null
  latency_ms: number | null
  observed_at: string
}

type ProgramEnrollmentRow = {
  program_key: string
  program_level: 'undergraduate'
  enrolled_at: string
  minimum_residence_until: string
  target_completion_at: string
  hard_deadline_at: string
}

type CredentialRow = {
  credential_key: string
  program_key: string
  program_level: 'undergraduate'
  title: string
  standing: 'A' | 'A+'
  awarded_at: string
}

export type CosUniversityGraduationGateSummary = {
  enabled: boolean
  status: CosUniversityRemediationGraduationStatus
  capstoneRun: {
    runId: string | null
    state: 'not_eligible' | 'already_graduated' | 'credential_awarded' | 'already_terminal' | 'passed' | 'failed' | 'error'
    passed: boolean | null
    reasons: string[]
  }
  assessmentRowsRead: number
  errors: string[]
  semantics: 'time_bounded_degree_credential_current_competence_separate'
}

const ASSESSMENT_SELECT = 'assessment_key,subject_id,language_code,language_dimension,assessment_kind,passed,independent_scorer,scorer_version,scorer_authority,observed_at,valid_until'
const RUN_SELECT = 'id,run_key,agent_id,profile,scorer_version,seed,manifest_hash,variant_hash,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at'

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function capstoneEvidence(rows: GeneralistCapstoneRunRow[], agentId: string, now: Date): CosUniversityGeneralistCapstoneRunEvidence[] {
  return rows
    .filter(row => (row.status === 'passed' || row.status === 'failed')
      && row.passed !== null
      && isCosUniversityGraduationExecutionEvidence(row, agentId)
      && row.profile === COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE
      && row.scorer_version === COS_UNIVERSITY_GENERALIST_CAPSTONE_SCORER
      && Number.isFinite(Date.parse(row.observed_at))
      && Date.parse(row.observed_at) <= now.getTime())
    .map(row => ({
      passed: row.passed === true,
      variantHash: row.variant_hash,
      observedAt: row.observed_at,
    }))
}

function mapEnrollment(row: ProgramEnrollmentRow | null): CosUniversityProgramEnrollment | null {
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

async function loadAssessmentRows(agentId: string): Promise<CosUniversityAssessmentRow[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_assessments')
    .select(ASSESSMENT_SELECT)
    .eq('agent_id', agentId)
    .order('observed_at', { ascending: false })
    .limit(10000)
  if (result.error) throw result.error
  return (result.data || []) as CosUniversityAssessmentRow[]
}

async function loadCapstoneRuns(agentId: string): Promise<GeneralistCapstoneRunRow[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_generalist_capstone_runs')
    .select(RUN_SELECT)
    .eq('agent_id', agentId)
    .order('observed_at', { ascending: false })
    .limit(1000)
  if (result.error) throw result.error
  return (result.data || []) as GeneralistCapstoneRunRow[]
}

async function loadUndergraduateEnrollment(agentId: string): Promise<CosUniversityProgramEnrollment | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
    .eq('agent_id', agentId)
    .eq('program_key', UNDERGRADUATE_PROGRAM_KEY)
    .maybeSingle()
  if (result.error) throw result.error
  return mapEnrollment((result.data || null) as ProgramEnrollmentRow | null)
}

async function loadUndergraduateCredential(agentId: string): Promise<CosUniversityCredential | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_credentials')
    .select('credential_key,program_key,program_level,title,standing,awarded_at')
    .eq('agent_id', agentId)
    .eq('credential_key', cosUniversityGeneralistUndergraduateCredentialKey(agentId))
    .maybeSingle()
  if (result.error) throw result.error
  return mapCredential((result.data || null) as CredentialRow | null)
}

async function loadUndergraduateRemediation(agentId: string): Promise<CosUniversityGraduationRemediation> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.rpc('read_cos_university_undergraduate_remediation', {
    p_agent_id: agentId, p_program_key: UNDERGRADUATE_PROGRAM_KEY,
  })
  if (result.error) throw result.error
  return parseCosUniversityGraduationRemediation(result.data, { agentId, programKey: UNDERGRADUATE_PROGRAM_KEY })
}

async function readGateState(now: Date, agentId: string): Promise<{
  academicState: CosUniversityAcademicState
  rows: CosUniversityAssessmentRow[]
  capstoneRuns: GeneralistCapstoneRunRow[]
  enrollment: CosUniversityProgramEnrollment | null
  credential: CosUniversityCredential | null
  status: CosUniversityRemediationGraduationStatus
}> {
  const [rows, capstoneRuns, enrollment, credential, remediation] = await Promise.all([
    loadAssessmentRows(agentId),
    loadCapstoneRuns(agentId),
    loadUndergraduateEnrollment(agentId),
    loadUndergraduateCredential(agentId),
    loadUndergraduateRemediation(agentId),
  ])
  const academicState = academicStateFromRows(rows, now)
  const academicStatus = deriveCosUniversityGeneralistGraduation({
    academicState,
    capstoneRuns: capstoneEvidence(capstoneRuns, agentId, now),
  })
  const status = applyCosUniversityGraduationRemediation(
    applyCosUniversityUndergraduateCalendar({ academicStatus, enrollment, credential, now }),
    remediation,
  )
  return { academicState, rows, capstoneRuns, enrollment, credential, status }
}

export async function readCosUniversityGeneralistGraduationStatus(now = new Date(), agentId: string = AGENT_ID): Promise<CosUniversityRemediationGraduationStatus> {
  return (await readGateState(now, String(agentId || '').trim() || AGENT_ID)).status
}

async function awardUndergraduateCredential(agentId: string, status: CosUniversityTimeBoundedGraduationStatus, now: Date): Promise<CosUniversityCredential | null> {
  requireCosUniversityGraduationRuntime(agentId)
  if (!status.awardEligible || !status.program.programKey) return null
  const standing = status.currentCompetenceStanding
  if (standing !== 'A' && standing !== 'A+') return null
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const remediation = await loadUndergraduateRemediation(agentId)
  if (remediation.pendingCount > 0) throw new Error('unresolved_undergraduate_remediation')
  const result = await db.from('cos_university_credentials').insert({
    credential_key: cosUniversityGeneralistUndergraduateCredentialKey(agentId),
    agent_id: agentId,
    program_key: status.program.programKey,
    program_level: 'undergraduate',
    title: COS_UNIVERSITY_GENERALIST_UNDERGRADUATE_TITLE,
    standing,
    awarded_at: now.toISOString(),
    evidence_snapshot: {
      issuedBy: 'host_graduation_gate',
      remediation,
      subjectBlockers: status.subjectBlockers.length,
      languageBlockers: status.languageBlockers.length,
      capstoneDistinctPasses: status.capstone.distinctPassesSinceLatestFailure,
      currentCompetenceStanding: standing,
      programTimingStatus: status.program.timingStatus,
    },
  }).select('credential_key,program_key,program_level,title,standing,awarded_at').maybeSingle()
  if (!result.error && result.data) return mapCredential(result.data as CredentialRow)
  if (String((result.error as { code?: string } | null)?.code || '') !== '23505' && result.error) throw result.error
  return loadUndergraduateCredential(agentId)
}

async function createOrFindCapstoneRun(agentId: string, now: Date): Promise<GeneralistCapstoneRunRow | null> {
  requireCosUniversityGraduationRuntime(agentId)
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const runKey = cosUniversityGeneralistCapstoneRunKey(agentId, dayKey(now))
  const existing = await db.from('cos_university_generalist_capstone_runs')
    .select(RUN_SELECT).eq('run_key', runKey).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data as GeneralistCapstoneRunRow

  const seed = randomUUID()
  const exam = buildCosUniversityGeneralistCapstoneExam(seed)
  const insert = await db.from('cos_university_generalist_capstone_runs').insert({
    run_key: runKey,
    agent_id: agentId,
    profile: exam.profile,
    scorer_version: exam.scorerVersion,
    seed,
    manifest_hash: exam.manifestHash,
    variant_hash: exam.manifestHash,
    status: 'created',
    observed_at: now.toISOString(),
  }).select(RUN_SELECT).maybeSingle()
  if (!insert.error && insert.data) return insert.data as GeneralistCapstoneRunRow
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') throw insert.error
  const retry = await db.from('cos_university_generalist_capstone_runs')
    .select(RUN_SELECT).eq('run_key', runKey).maybeSingle()
  if (retry.error) throw retry.error
  return (retry.data || null) as GeneralistCapstoneRunRow | null
}

async function executeCapstoneRun(row: GeneralistCapstoneRunRow, now: Date): Promise<CosUniversityGraduationGateSummary['capstoneRun']> {
  requireCosUniversityGraduationRuntime(row.agent_id)
  const db = cosServiceDb()
  if (!db) return { runId: row.id, state: 'error', passed: null, reasons: ['service_database_unavailable'] }
  const exam = buildCosUniversityGeneralistCapstoneExam(row.seed)
  if (exam.manifestHash !== row.manifest_hash
    || row.profile !== COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE
    || row.scorer_version !== COS_UNIVERSITY_GENERALIST_CAPSTONE_SCORER) {
    const reasons = ['capstone_manifest_drift']
    await db.from('cos_university_generalist_capstone_runs').update({
      status: 'error', reasons, completed_at: now.toISOString(), updated_at: now.toISOString(),
    }).eq('id', row.id)
    return { runId: row.id, state: 'error', passed: null, reasons }
  }

  const claim = await db.from('cos_university_generalist_capstone_runs').update({
    status: 'running', started_at: now.toISOString(), updated_at: now.toISOString(),
  }).eq('id', row.id).eq('status', 'created').select('id').maybeSingle()
  if (claim.error) throw claim.error
  if (!claim.data) {
    return {
      runId: row.id,
      state: 'error',
      passed: null,
      reasons: ['capstone_run_not_claimed'],
    }
  }

  const started = Date.now()
  beginEvidenceSourceUseTurn()
  let result: Awaited<ReturnType<typeof tryCOSFirstAnswer>>
  try {
    if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
      await ensureLocalInferenceRuntimeReady()
      await generateLocalEmbedding(exam.prompt)
    }
    result = await tryCOSFirstAnswer({
      prompt: exam.prompt,
      language: 'en',
      privileged: true,
      disableCache: true,
    })
  } catch (error) {
    flushCapturedEvidenceSourceUse()
    const reasons = [`execution_error:${error instanceof Error ? error.message : String(error)}`]
    const completedAt = new Date().toISOString()
    await db.from('cos_university_generalist_capstone_runs').update({
      status: 'error', reasons, completed_at: completedAt, updated_at: completedAt,
    }).eq('id', row.id)
    return { runId: row.id, state: 'error', passed: null, reasons }
  }

  const reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
  const turnId = peekEvidenceSourceUseTurnId()
  const provenance = {
    localReasoning: result.provenance.localModelInvoked,
    externalAi: result.provenance.externalAiInvoked,
    semanticCache: result.provenance.responseSource === 'semantic_cache' || result.provenance.responseSource === 'semantic_similarity',
    handled: result.handled,
    turnId,
  }
  const score = scoreCosUniversityGeneralistCapstoneExam(exam, reply, provenance)
  const freshExecution = Boolean(
    result.handled
    && result.provenance.localModelInvoked
    && !result.provenance.externalAiInvoked
    && !provenance.semanticCache
    && turnId,
  )
  const passed = freshExecution ? score.passed : null
  const status = freshExecution ? (score.passed ? 'passed' : 'failed') : 'error'
  const reasons = freshExecution ? score.reasons : [...score.reasons, 'fresh_execution_required']
  const completedAt = new Date().toISOString()
  flushCapturedEvidenceSourceUse()

  const update = await db.from('cos_university_generalist_capstone_runs').update({
    status,
    passed,
    turn_id: turnId || null,
    response_source: result.provenance.responseSource,
    local_model_invoked: Boolean(result.provenance.localModelInvoked),
    external_ai_invoked: Boolean(result.provenance.externalAiInvoked),
    fresh_execution: freshExecution,
    reasons,
    latency_ms: Date.now() - started,
    completed_at: completedAt,
    updated_at: completedAt,
  }).eq('id', row.id)
  if (update.error) throw update.error

  if (turnId) {
    await attachTurnOutcome(turnId, {
      verifiedSuccess: score.passed && freshExecution,
      repairNeeded: !score.passed || !freshExecution,
      escalated: !result.handled,
      source: `cos_university_generalist_capstone:${row.id}`,
    })
  }

  return {
    runId: row.id,
    state: status === 'passed' ? 'passed' : status === 'failed' ? 'failed' : 'error',
    passed,
    reasons,
  }
}

function disabledStatus(now: Date): CosUniversityRemediationGraduationStatus {
  const academicState = academicStateFromRows([], now)
  const academicStatus = deriveCosUniversityGeneralistGraduation({ academicState, capstoneRuns: [] })
  return {
    ...applyCosUniversityUndergraduateCalendar({ academicStatus, enrollment: null, credential: null, now }),
    remediation: null, // Unavailable or disabled is not proof of zero unresolved plans.
  }
}

export async function runCosUniversityGeneralistGraduationGate(options: { now?: Date; agentId?: string } = {}): Promise<CosUniversityGraduationGateSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  // Every registered agent graduates under the same gate: its own enrollment, its own minimum
  // residence and deadline, its own subject/language evidence and its own capstone passes.
  const agentId = String(options.agentId || AGENT_ID).trim() || AGENT_ID
  const emptyStatus = disabledStatus(now)
  if (process.env.COS_UNIVERSITY_GRADUATION_ENABLED !== 'true') {
    return {
      enabled: false,
      status: emptyStatus,
      capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['graduation_gate_disabled'] },
      assessmentRowsRead: 0,
      errors: [],
      semantics: 'time_bounded_degree_credential_current_competence_separate',
    }
  }

  try {
    const before = await readGateState(now, agentId)
    if (before.status.graduated) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'already_graduated', passed: true, reasons: [] },
        assessmentRowsRead: before.rows.length,
        errors: [],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }
    if (before.status.program.timingStatus === 'not_enrolled') {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['undergraduate_program_not_enrolled'] },
        assessmentRowsRead: before.rows.length,
        errors: [],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }
    if (before.status.program.deadlineExpired) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['undergraduate_program_deadline_expired'] },
        assessmentRowsRead: before.rows.length,
        errors: [],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }
    if (!before.status.remediation) throw new Error('graduation_remediation_not_checked')
    if (before.status.remediation.pendingCount > 0) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['unresolved_undergraduate_remediation'] },
        assessmentRowsRead: before.rows.length,
        errors: [],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }
    if (!before.status.prerequisitesReady) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['subject_or_language_prerequisites_incomplete'] },
        assessmentRowsRead: before.rows.length,
        errors: [],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }
    if (!before.status.program.minimumResidenceSatisfied) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['minimum_residence_incomplete'] },
        assessmentRowsRead: before.rows.length,
        errors: [],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }
    const runtimeBlocker = cosUniversityGraduationRuntimeBlocker(agentId)
    if (runtimeBlocker) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'error', passed: null, reasons: [runtimeBlocker] },
        assessmentRowsRead: before.rows.length,
        errors: [runtimeBlocker],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }
    if (before.status.awardEligible) {
      const credential = await awardUndergraduateCredential(agentId, before.status, now)
      if (!credential) throw new Error('undergraduate_credential_not_persisted')
      const awarded = await readGateState(new Date(), agentId)
      if (!awarded.status.graduated) throw new Error('undergraduate_credential_not_verified')
      return {
        enabled: true,
        status: awarded.status,
        capstoneRun: { runId: null, state: 'credential_awarded', passed: true, reasons: [] },
        assessmentRowsRead: awarded.rows.length,
        errors: [],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }

    const row = await createOrFindCapstoneRun(agentId, now)
    if (!row) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'error', passed: null, reasons: ['service_database_unavailable'] },
        assessmentRowsRead: before.rows.length,
        errors: ['service_database_unavailable'],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }

    const capstoneRun = row.status === 'created'
      ? await executeCapstoneRun(row, now)
      : row.status === 'error' || row.status === 'running'
        ? { runId: row.id, state: 'error' as const, passed: null, reasons: row.reasons?.length ? row.reasons : ['capstone_run_unavailable'] }
        : { runId: row.id, state: 'already_terminal' as const, passed: row.passed, reasons: row.reasons || [] }
    if (capstoneRun.state === 'error') {
      return {
        enabled: true,
        status: before.status,
        capstoneRun,
        assessmentRowsRead: before.rows.length,
        errors: capstoneRun.reasons.length ? capstoneRun.reasons : ['capstone_execution_failed'],
        semantics: 'time_bounded_degree_credential_current_competence_separate',
      }
    }
    const provisional = await readGateState(new Date(), agentId)
    if (provisional.status.awardEligible) {
      const credential = await awardUndergraduateCredential(agentId, provisional.status, new Date())
      if (!credential) throw new Error('undergraduate_credential_not_persisted')
    }
    const after = await readGateState(new Date(), agentId)
    if (provisional.status.awardEligible && !after.status.graduated) throw new Error('undergraduate_credential_not_verified')
    return {
      enabled: true,
      status: after.status,
      capstoneRun: after.status.graduated
        ? { ...capstoneRun, state: 'credential_awarded', passed: true }
        : capstoneRun,
      assessmentRowsRead: after.rows.length,
      errors: [],
      semantics: 'time_bounded_degree_credential_current_competence_separate',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      enabled: true,
      status: emptyStatus,
      capstoneRun: { runId: null, state: 'error', passed: null, reasons: [message] },
      assessmentRowsRead: 0,
      errors: [message],
      semantics: 'time_bounded_degree_credential_current_competence_separate',
    }
  }
}
