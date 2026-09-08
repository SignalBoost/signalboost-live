import { randomUUID } from 'node:crypto'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import {
  beginEvidenceSourceUseTurn,
  peekEvidenceSourceUseTurnId,
} from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  COS_UNIVERSITY_MASTERS_EXAM_PROFILE,
  COS_UNIVERSITY_MASTERS_EXAM_SCORER,
  buildCosUniversityMastersExam,
  scoreCosUniversityMastersExam,
  selectNextCosUniversityMastersExamTarget,
  type CosUniversityMastersExamStage,
  type CosUniversityMastersExamTarget,
} from './cosUniversityMastersExam.ts'
import {
  cosUniversityMastersExpectedAuthority,
  cosUniversityMastersTrackIdFromProgramKey,
  type CosUniversityMastersProgramId,
} from './cosUniversityMasters.ts'
import {
  readCosUniversityMastersEvidence,
  readCosUniversityMastersRuntimeStatus,
  recordHostCosUniversityMastersEvidence,
} from './cosUniversityMastersRuntime.ts'

const AGENT_ID = 'cos'

type EnrollmentRow = { program_key: string }
type ExamRunRow = {
  id: string
  run_key: string
  program_id: CosUniversityMastersProgramId
  module_key: string | null
  stage: CosUniversityMastersExamStage
  profile: string
  scorer_version: string
  seed: string
  manifest_hash: string
  variant_hash: string
  status: 'created' | 'running' | 'passed' | 'failed' | 'error'
  passed: boolean | null
  reasons: string[] | null
  latency_ms: number | null
}

export type CosUniversityMastersExamRunSummary = {
  enabled: boolean
  programId: CosUniversityMastersProgramId | null
  runId: string | null
  target: CosUniversityMastersExamTarget | null
  status: 'disabled' | 'not_enrolled' | 'program_inactive' | 'study_required' | 'awaiting_practical' | 'complete' | 'passed' | 'failed' | 'error' | 'already_complete' | 'not_claimed'
  passed: boolean | null
  evidenceRecorded: boolean
  turnId: string | null
  reasons: string[]
  latencyMs: number | null
  semantics: 'host_seeded_masters_exam_independent_from_study_and_owner'
}

function summary(args: Partial<CosUniversityMastersExamRunSummary> = {}): CosUniversityMastersExamRunSummary {
  return {
    enabled: process.env.COS_UNIVERSITY_MASTERS_EXAMS_ENABLED === 'true',
    programId: null,
    runId: null,
    target: null,
    status: 'error',
    passed: null,
    evidenceRecorded: false,
    turnId: null,
    reasons: [],
    latencyMs: null,
    semantics: 'host_seeded_masters_exam_independent_from_study_and_owner',
    ...args,
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  try { return JSON.stringify(error).slice(0, 1600) } catch { return String(error) }
}

function hourKey(now: Date): string {
  return now.toISOString().slice(0, 13)
}

function targetKey(target: CosUniversityMastersExamTarget): string {
  return `${target.programId}:${target.stage}:${target.moduleKey || 'integrated'}`
}

async function activeProgramId(): Promise<CosUniversityMastersProgramId | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key')
    .eq('agent_id', AGENT_ID)
    .eq('program_level', 'masters')
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  const row = (result.data || null) as EnrollmentRow | null
  return row ? cosUniversityMastersTrackIdFromProgramKey(row.program_key) : null
}

async function courseworkStudyPlan(target: CosUniversityMastersExamTarget): Promise<{ id: string; attempt_count: number } | null> {
  if (target.stage !== 'graduate_coursework' || !target.moduleKey) return null
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_university_study_plans')
    .select('id,attempt_count')
    .eq('agent_id', AGENT_ID)
    .eq('academic_level', 'masters')
    .eq('program_key', `specialist_masters_${target.programId}_v1`)
    .eq('module_key', target.moduleKey)
    .in('status', ['studying', 'ready_for_exam'])
    .gt('attempt_count', 0)
    .maybeSingle()
  if (result.error) throw result.error
  return (result.data || null) as { id: string; attempt_count: number } | null
}

async function markCourseworkPlanComplete(planId: string): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const now = new Date().toISOString()
  const result = await db.from('cos_university_study_plans').update({
    status: 'completed',
    completed_at: now,
    updated_at: now,
  }).eq('id', planId)
  if (result.error) throw result.error
}

async function findRun(runKey: string): Promise<ExamRunRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_university_masters_exam_runs')
    .select('id,run_key,program_id,module_key,stage,profile,scorer_version,seed,manifest_hash,variant_hash,status,passed,reasons,latency_ms')
    .eq('run_key', runKey)
    .maybeSingle()
  if (result.error) throw result.error
  return (result.data || null) as ExamRunRow | null
}

async function createOrFindRun(target: CosUniversityMastersExamTarget, now: Date): Promise<ExamRunRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const runKey = `${COS_UNIVERSITY_MASTERS_EXAM_PROFILE}:${hourKey(now)}:${targetKey(target)}`
  const existing = await findRun(runKey)
  if (existing) return existing
  const seed = randomUUID()
  const exam = buildCosUniversityMastersExam(seed, target)
  const insert = await db.from('cos_university_masters_exam_runs').insert({
    run_key: runKey,
    agent_id: AGENT_ID,
    program_key: `specialist_masters_${target.programId}_v1`,
    program_id: target.programId,
    module_key: target.moduleKey,
    stage: target.stage,
    profile: exam.profile,
    scorer_version: exam.scorerVersion,
    seed,
    manifest_hash: exam.manifestHash,
    variant_hash: exam.manifestHash,
    status: 'created',
    observed_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).select('id,run_key,program_id,module_key,stage,profile,scorer_version,seed,manifest_hash,variant_hash,status,passed,reasons,latency_ms').maybeSingle()
  if (!insert.error && insert.data) return insert.data as ExamRunRow
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') throw insert.error
  return findRun(runKey)
}

async function claimRun(row: ExamRunRow, now: Date): Promise<boolean> {
  const db = cosServiceDb()
  if (!db || row.status !== 'created') return false
  const result = await db.from('cos_university_masters_exam_runs').update({
    status: 'running',
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', row.id).eq('status', 'created').select('id').maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data?.id)
}

function targetFromRow(row: ExamRunRow): CosUniversityMastersExamTarget {
  return { programId: row.program_id, stage: row.stage, moduleKey: row.module_key }
}

async function executeRun(
  row: ExamRunRow,
  target: CosUniversityMastersExamTarget,
  courseworkPlanId: string | null,
  now: Date,
): Promise<CosUniversityMastersExamRunSummary> {
  const db = cosServiceDb()
  if (!db) return summary({ programId: target.programId, runId: row.id, target, status: 'error', reasons: ['service_database_unavailable'] })
  const exam = buildCosUniversityMastersExam(row.seed, target)
  if (exam.manifestHash !== row.manifest_hash || row.profile !== exam.profile || row.scorer_version !== exam.scorerVersion) {
    const reasons = ['exam_manifest_drift']
    await db.from('cos_university_masters_exam_runs').update({ status: 'error', reasons, updated_at: now.toISOString(), completed_at: now.toISOString() }).eq('id', row.id)
    return summary({ programId: target.programId, runId: row.id, target, status: 'error', reasons })
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
    const reasons = [`execution_error:${describeError(error)}`]
    const completedAt = new Date().toISOString()
    await db.from('cos_university_masters_exam_runs').update({ status: 'error', reasons, updated_at: completedAt, completed_at: completedAt }).eq('id', row.id)
    return summary({ programId: target.programId, runId: row.id, target, status: 'error', reasons, latencyMs: Date.now() - started })
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
  const score = scoreCosUniversityMastersExam(exam, reply, provenance)
  const freshExecution = Boolean(
    result.handled
    && result.provenance.localModelInvoked
    && !result.provenance.externalAiInvoked
    && !provenance.semanticCache
    && turnId,
  )
  const passed = freshExecution ? score.passed : null
  const terminalStatus = freshExecution ? (score.passed ? 'passed' : 'failed') : 'error'
  const reasons = freshExecution ? score.reasons : [...score.reasons, 'fresh_execution_required']
  const completedAt = new Date()
  flushCapturedEvidenceSourceUse()

  const update = await db.from('cos_university_masters_exam_runs').update({
    status: terminalStatus,
    passed,
    turn_id: turnId || null,
    response_source: result.provenance.responseSource,
    local_model_invoked: Boolean(result.provenance.localModelInvoked),
    external_ai_invoked: Boolean(result.provenance.externalAiInvoked),
    fresh_execution: freshExecution,
    reasons,
    latency_ms: Date.now() - started,
    completed_at: completedAt.toISOString(),
    updated_at: completedAt.toISOString(),
  }).eq('id', row.id)
  if (update.error) throw update.error

  let evidenceRecorded = false
  if (freshExecution) {
    evidenceRecorded = await recordHostCosUniversityMastersEvidence({
      programId: target.programId,
      moduleKey: target.moduleKey,
      evidenceKey: `masters-exam:${row.id}`,
      stage: target.stage,
      passed: score.passed,
      variantHash: row.variant_hash,
      authority: cosUniversityMastersExpectedAuthority(target.stage),
      sourceRef: `cos_university_masters_exam:${row.id}`,
      scorerVersion: COS_UNIVERSITY_MASTERS_EXAM_SCORER,
      observedAt: completedAt,
      validityDays: target.stage === 'graduate_coursework' ? 365 : 180,
      evidenceSnapshot: {
        profile: COS_UNIVERSITY_MASTERS_EXAM_PROFILE,
        manifestHash: row.manifest_hash,
        turnId,
        responseSource: result.provenance.responseSource,
        localModelInvoked: result.provenance.localModelInvoked,
        externalAiInvoked: result.provenance.externalAiInvoked,
        reasons,
      },
    })
  }

  if (turnId) {
    await attachTurnOutcome(turnId, {
      verifiedSuccess: Boolean(score.passed && freshExecution),
      repairNeeded: !score.passed || !freshExecution,
      escalated: !result.handled,
      source: `cos_university_masters_exam:${row.id}`,
    })
  }
  if (courseworkPlanId && score.passed && freshExecution && evidenceRecorded) await markCourseworkPlanComplete(courseworkPlanId)

  return summary({
    programId: target.programId,
    runId: row.id,
    target,
    status: terminalStatus,
    passed,
    evidenceRecorded,
    turnId: turnId || null,
    reasons,
    latencyMs: Date.now() - started,
  })
}

export async function runCosUniversityMastersExam(options: { now?: Date } = {}): Promise<CosUniversityMastersExamRunSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  if (process.env.COS_UNIVERSITY_MASTERS_EXAMS_ENABLED !== 'true') return summary({ enabled: false, status: 'disabled' })

  try {
    const programId = await activeProgramId()
    if (!programId) return summary({ status: 'not_enrolled' })
    const runtime = await readCosUniversityMastersRuntimeStatus(programId, now)
    if (!runtime.enrollment || runtime.credential || runtime.timingStatus === 'deadline_expired' || runtime.timingStatus === 'not_enrolled') {
      return summary({ programId, status: 'program_inactive' })
    }

    const evidence = await readCosUniversityMastersEvidence(programId)
    const target = selectNextCosUniversityMastersExamTarget(programId, evidence, now)
    if (!target) {
      const practical = runtime.graduation.blockers.includes('verified_practical_work_incomplete')
      return summary({ programId, status: practical ? 'awaiting_practical' : 'complete' })
    }

    let planId: string | null = null
    if (target.stage === 'graduate_coursework') {
      const plan = await courseworkStudyPlan(target)
      if (!plan) return summary({ programId, target, status: 'study_required', reasons: ['module_study_required_before_coursework_exam'] })
      planId = plan.id
    }

    const row = await createOrFindRun(target, now)
    if (!row) return summary({ programId, target, status: 'error', reasons: ['service_database_unavailable'] })
    const canonicalTarget = targetFromRow(row)
    if (row.status === 'passed' || row.status === 'failed') {
      return summary({ programId, runId: row.id, target: canonicalTarget, status: 'already_complete', passed: row.passed, reasons: row.reasons || [], latencyMs: row.latency_ms })
    }
    if (row.status !== 'created') return summary({ programId, runId: row.id, target: canonicalTarget, status: 'not_claimed', reasons: [`run_status:${row.status}`] })
    if (!await claimRun(row, now)) return summary({ programId, runId: row.id, target: canonicalTarget, status: 'not_claimed', reasons: ['concurrent_claim'] })
    return executeRun(row, canonicalTarget, planId, now)
  } catch (error) {
    return summary({ status: 'error', reasons: [describeError(error)] })
  }
}
