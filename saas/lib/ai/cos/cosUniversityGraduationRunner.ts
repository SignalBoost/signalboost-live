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
  type CosUniversityGeneralistGraduationStatus,
} from './cosUniversityGraduation.ts'

const AGENT_ID = 'cos'

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

export type CosUniversityGraduationGateSummary = {
  enabled: boolean
  status: CosUniversityGeneralistGraduationStatus
  capstoneRun: {
    runId: string | null
    state: 'not_eligible' | 'already_graduated' | 'already_terminal' | 'passed' | 'failed' | 'error'
    passed: boolean | null
    reasons: string[]
  }
  assessmentRowsRead: number
  errors: string[]
  semantics: 'graduation_is_derived_and_revocable'
}

const ASSESSMENT_SELECT = 'assessment_key,subject_id,language_code,language_dimension,assessment_kind,passed,independent_scorer,scorer_version,scorer_authority,observed_at,valid_until'
const RUN_SELECT = 'id,run_key,agent_id,profile,scorer_version,seed,manifest_hash,variant_hash,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at'

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function capstoneEvidence(rows: GeneralistCapstoneRunRow[]): CosUniversityGeneralistCapstoneRunEvidence[] {
  return rows
    .filter(row => (row.status === 'passed' || row.status === 'failed') && row.passed !== null)
    .map(row => ({
      passed: row.passed === true,
      variantHash: row.variant_hash,
      observedAt: row.observed_at,
    }))
}

async function loadAssessmentRows(): Promise<CosUniversityAssessmentRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_assessments')
    .select(ASSESSMENT_SELECT)
    .eq('agent_id', AGENT_ID)
    .order('observed_at', { ascending: false })
    .limit(10000)
  if (result.error) throw result.error
  return (result.data || []) as CosUniversityAssessmentRow[]
}

async function loadCapstoneRuns(): Promise<GeneralistCapstoneRunRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_generalist_capstone_runs')
    .select(RUN_SELECT)
    .eq('agent_id', AGENT_ID)
    .order('observed_at', { ascending: false })
    .limit(1000)
  if (result.error) throw result.error
  return (result.data || []) as GeneralistCapstoneRunRow[]
}

async function readGateState(now: Date): Promise<{
  academicState: CosUniversityAcademicState
  rows: CosUniversityAssessmentRow[]
  capstoneRuns: GeneralistCapstoneRunRow[]
  status: CosUniversityGeneralistGraduationStatus
}> {
  const [rows, capstoneRuns] = await Promise.all([loadAssessmentRows(), loadCapstoneRuns()])
  const academicState = academicStateFromRows(rows, now)
  const status = deriveCosUniversityGeneralistGraduation({
    academicState,
    capstoneRuns: capstoneEvidence(capstoneRuns),
  })
  return { academicState, rows, capstoneRuns, status }
}

export async function readCosUniversityGeneralistGraduationStatus(now = new Date()): Promise<CosUniversityGeneralistGraduationStatus> {
  return (await readGateState(now)).status
}

async function createOrFindCapstoneRun(now: Date): Promise<GeneralistCapstoneRunRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const runKey = `${COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE}:${dayKey(now)}`
  const existing = await db.from('cos_university_generalist_capstone_runs')
    .select(RUN_SELECT).eq('run_key', runKey).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data as GeneralistCapstoneRunRow

  const seed = randomUUID()
  const exam = buildCosUniversityGeneralistCapstoneExam(seed)
  const insert = await db.from('cos_university_generalist_capstone_runs').insert({
    run_key: runKey,
    agent_id: AGENT_ID,
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
      state: 'already_terminal',
      passed: row.passed,
      reasons: row.reasons || ['not_claimed'],
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

export async function runCosUniversityGeneralistGraduationGate(options: { now?: Date } = {}): Promise<CosUniversityGraduationGateSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  const disabledAcademicState = academicStateFromRows([], now)
  const disabledStatus = deriveCosUniversityGeneralistGraduation({ academicState: disabledAcademicState, capstoneRuns: [] })
  if (process.env.COS_UNIVERSITY_GRADUATION_ENABLED !== 'true') {
    return {
      enabled: false,
      status: disabledStatus,
      capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['graduation_gate_disabled'] },
      assessmentRowsRead: 0,
      errors: [],
      semantics: 'graduation_is_derived_and_revocable',
    }
  }

  try {
    const before = await readGateState(now)
    if (!before.status.prerequisitesReady) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'not_eligible', passed: null, reasons: ['subject_or_language_prerequisites_incomplete'] },
        assessmentRowsRead: before.rows.length,
        errors: [],
        semantics: 'graduation_is_derived_and_revocable',
      }
    }
    if (before.status.graduated) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'already_graduated', passed: true, reasons: [] },
        assessmentRowsRead: before.rows.length,
        errors: [],
        semantics: 'graduation_is_derived_and_revocable',
      }
    }

    const row = await createOrFindCapstoneRun(now)
    if (!row) {
      return {
        enabled: true,
        status: before.status,
        capstoneRun: { runId: null, state: 'error', passed: null, reasons: ['service_database_unavailable'] },
        assessmentRowsRead: before.rows.length,
        errors: ['service_database_unavailable'],
        semantics: 'graduation_is_derived_and_revocable',
      }
    }

    const capstoneRun = row.status === 'created'
      ? await executeCapstoneRun(row, now)
      : { runId: row.id, state: 'already_terminal' as const, passed: row.passed, reasons: row.reasons || [] }
    const after = await readGateState(new Date())
    return {
      enabled: true,
      status: after.status,
      capstoneRun,
      assessmentRowsRead: after.rows.length,
      errors: [],
      semantics: 'graduation_is_derived_and_revocable',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      enabled: true,
      status: disabledStatus,
      capstoneRun: { runId: null, state: 'error', passed: null, reasons: [message] },
      assessmentRowsRead: 0,
      errors: [message],
      semantics: 'graduation_is_derived_and_revocable',
    }
  }
}
