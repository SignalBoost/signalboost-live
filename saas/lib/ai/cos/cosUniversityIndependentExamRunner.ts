import { randomUUID } from 'node:crypto'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { attachTurnOutcome, recordTurnLearningEnrichment } from '@/lib/ai/cos/turnExperienceStore'
import { decideCosTurnExperience } from '@/lib/ai/cos/cognitiveTurnExperience'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordCosUniversityAssessment } from './cosUniversityStore.ts'
import type { CosUniversitySubjectId } from './cosUniversity.ts'
import type { CosPlatformLanguage, CosPlatformLanguageDimension } from './cosUniversityLanguages.ts'
import {
  COS_UNIVERSITY_EXAM_PROFILE,
  COS_UNIVERSITY_EXAM_SCORER,
  buildCosUniversityBlindExam,
  scoreCosUniversityBlindExam,
  selectCosUniversityExamTargets,
  universityExamValidUntil,
  type CosUniversityExamAssessmentRow,
  type CosUniversityExamTarget,
} from './cosUniversityIndependentExam.ts'

const DEFAULT_AGENT_ID = 'cos'

export type CosUniversityExamRunSummary = {
  runId: string | null
  target: CosUniversityExamTarget
  status: 'passed' | 'failed' | 'error' | 'already_complete' | 'not_claimed'
  passed: boolean | null
  assessmentRecorded: boolean
  manifestHash: string | null
  reasons: string[]
  latencyMs: number | null
}

export type CosUniversityExamBatchSummary = {
  enabled: boolean
  attempted: number
  passed: number
  failed: number
  assessmentRowsWritten: number
  runs: CosUniversityExamRunSummary[]
  errors: string[]
  semantics: 'host_seeded_independent_exam_no_self_grading'
}

type ExamRunRow = {
  id: string
  run_key: string
  profile: string
  scorer_version: string
  seed: string
  manifest_hash: string
  target_kind: 'subject' | 'language'
  subject_id: CosUniversitySubjectId | null
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  status: 'created' | 'running' | 'passed' | 'failed' | 'error'
  passed: boolean | null
  reasons: string[] | null
  latency_ms: number | null
}

type ReadyStudyPlan = { id: string; attemptCount: number; target: CosUniversityExamTarget }

function targetKey(target: CosUniversityExamTarget): string {
  return target.kind === 'subject'
    ? `subject:${target.subjectId}`
    : `language:${target.language}:${target.dimension}`
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

async function loadAssessmentRows(agentId: string): Promise<CosUniversityExamAssessmentRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_assessments')
    .select('subject_id,language_code,language_dimension,assessment_kind,passed,independent_scorer,scorer_authority,observed_at,valid_until')
    .eq('agent_id', agentId)
    .order('observed_at', { ascending: false })
    .limit(5000)
  if (result.error) throw result.error
  return (result.data || []) as CosUniversityExamAssessmentRow[]
}

async function loadReadyStudyPlans(agentId: string, limit: number): Promise<ReadyStudyPlan[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_study_plans')
    .select('id,attempt_count,subject_id,language_code,language_dimension')
    .eq('agent_id', agentId)
    .eq('status', 'ready_for_exam')
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (result.error) throw result.error
  const plans: ReadyStudyPlan[] = []
  for (const row of result.data || []) {
    if (row.language_code && row.language_dimension) {
      plans.push({ id: row.id, attemptCount: Number(row.attempt_count || 0), target: { kind: 'language', language: row.language_code as CosPlatformLanguage, dimension: row.language_dimension as CosPlatformLanguageDimension } })
    } else if (row.subject_id) {
      plans.push({ id: row.id, attemptCount: Number(row.attempt_count || 0), target: { kind: 'subject', subjectId: row.subject_id as CosUniversitySubjectId } })
    }
  }
  return plans
}

async function reconcileReadyStudyPlan(planId: string, run: CosUniversityExamRunSummary): Promise<void> {
  if (run.status !== 'passed' && run.status !== 'failed' && run.status !== 'already_complete') return
  if (run.status === 'already_complete' && run.passed === null) return
  const db = cosServiceDb()
  if (!db) return
  const passed = run.status === 'passed' || (run.status === 'already_complete' && run.passed === true)
  const now = new Date().toISOString()
  const result = await db.from('cos_university_study_plans').update({
    status: passed ? 'completed' : 'superseded',
    completed_at: passed ? now : null,
    updated_at: now,
  }).eq('id', planId).eq('status', 'ready_for_exam')
  if (result.error) throw result.error
}

async function findRun(runKey: string): Promise<ExamRunRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_university_exam_runs')
    .select('id,run_key,profile,scorer_version,seed,manifest_hash,target_kind,subject_id,language_code,language_dimension,status,passed,reasons,latency_ms')
    .eq('run_key', runKey)
    .maybeSingle()
  if (result.error) throw result.error
  return (result.data || null) as ExamRunRow | null
}

async function createOrFindRun(agentId: string, target: CosUniversityExamTarget, now: Date, readyPlan?: Pick<ReadyStudyPlan, 'id' | 'attemptCount'>): Promise<ExamRunRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const remediationAttempt = readyPlan ? `:plan:${readyPlan.id}:study-attempt:${readyPlan.attemptCount}` : ''
  const runKey = `${COS_UNIVERSITY_EXAM_PROFILE}:${agentId}:${dayKey(now)}:${targetKey(target)}${remediationAttempt}`
  const existing = await findRun(runKey)
  if (existing) return existing

  const seed = randomUUID()
  const exam = buildCosUniversityBlindExam(seed, target)
  const insert = await db.from('cos_university_exam_runs').insert({
    run_key: runKey,
    profile: COS_UNIVERSITY_EXAM_PROFILE,
    scorer_version: COS_UNIVERSITY_EXAM_SCORER,
    seed,
    manifest_hash: exam.manifestHash,
    target_kind: target.kind,
    subject_id: target.kind === 'subject' ? target.subjectId : null,
    language_code: target.kind === 'language' ? target.language : null,
    language_dimension: target.kind === 'language' ? target.dimension : null,
    assessment_kind: 'unseen_subject_exam',
    status: 'created',
  }).select('id,run_key,profile,scorer_version,seed,manifest_hash,target_kind,subject_id,language_code,language_dimension,status,passed,reasons,latency_ms').maybeSingle()

  if (!insert.error && insert.data) return insert.data as ExamRunRow
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') throw insert.error
  return findRun(runKey)
}

async function claimCreatedRun(row: ExamRunRow, now: Date): Promise<boolean> {
  const db = cosServiceDb()
  if (!db || row.status !== 'created') return false
  const result = await db.from('cos_university_exam_runs').update({
    status: 'running',
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq('id', row.id).eq('status', 'created').select('id').maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data?.id)
}

function targetFromRun(row: ExamRunRow): CosUniversityExamTarget | null {
  if (row.target_kind === 'subject' && row.subject_id) {
    return { kind: 'subject', subjectId: row.subject_id }
  }
  if (row.target_kind === 'language' && row.language_code && row.language_dimension) {
    return { kind: 'language', language: row.language_code, dimension: row.language_dimension }
  }
  return null
}

async function executeExam(agentId: string, row: ExamRunRow, target: CosUniversityExamTarget, now: Date): Promise<CosUniversityExamRunSummary> {
  const db = cosServiceDb()
  if (!db) return { runId: row.id, target, status: 'error', passed: null, assessmentRecorded: false, manifestHash: row.manifest_hash, reasons: ['service_database_unavailable'], latencyMs: null }
  const exam = buildCosUniversityBlindExam(row.seed, target)
  if (exam.manifestHash !== row.manifest_hash || row.profile !== exam.profile || row.scorer_version !== exam.scorerVersion) {
    const reasons = ['exam_manifest_drift']
    await db.from('cos_university_exam_runs').update({ status: 'error', reasons, completed_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', row.id)
    return { runId: row.id, target, status: 'error', passed: null, assessmentRecorded: false, manifestHash: exam.manifestHash, reasons, latencyMs: null }
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
      language: target.kind === 'language' ? target.language : 'en',
      privileged: true,
      disableCache: true,
    })
  } catch (error) {
    flushCapturedEvidenceSourceUse()
    const reasons = [`execution_error:${error instanceof Error ? error.message : String(error)}`]
    await db.from('cos_university_exam_runs').update({ status: 'error', reasons, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id)
    return { runId: row.id, target, status: 'error', passed: null, assessmentRecorded: false, manifestHash: exam.manifestHash, reasons, latencyMs: Date.now() - started }
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
  const score = scoreCosUniversityBlindExam(exam, reply, provenance)
  const latencyMs = Date.now() - started
  flushCapturedEvidenceSourceUse()

  if (turnId) {
    const learningDecision = decideCosTurnExperience({
      prompt: exam.prompt,
      handled: result.handled,
      confidence: result.confidence,
      provenance: result.provenance,
      failureReason: score.passed ? null : score.reasons.join('; '),
    })
    recordTurnLearningEnrichment({
      turnId,
      problemClass: target.kind === 'subject' ? target.subjectId : `language_${target.language}_${target.dimension}`,
      predictedConfidence: result.confidence,
      routeClass: learningDecision.routeClass,
      responseSource: String(learningDecision.evidence.responseSource || result.provenance.responseSource || 'unknown'),
      evidenceSummary: asRecord(learningDecision.evidence.utilization),
      failureReason: score.passed ? null : score.reasons.join('; ').slice(0, 1200),
    })
    await attachTurnOutcome(turnId, {
      verifiedSuccess: score.passed,
      repairNeeded: !score.passed,
      escalated: !result.handled,
      source: `cos_university_exam:${row.id}`,
    })
  }

  const freshExecution = Boolean(
    result.handled
    && result.provenance.localModelInvoked
    && !result.provenance.externalAiInvoked
    && !provenance.semanticCache
    && turnId,
  )

  let assessmentRecorded = false
  if (freshExecution) {
    const observedAt = new Date()
    assessmentRecorded = await recordCosUniversityAssessment({
      agentId,
      assessmentKey: `cos-university-exam:${row.id}`,
      ...(target.kind === 'subject'
        ? { subjectId: target.subjectId }
        : { language: target.language, languageDimension: target.dimension }),
      kind: 'unseen_subject_exam',
      passed: score.passed,
      independentScorer: true,
      scorerVersion: COS_UNIVERSITY_EXAM_SCORER,
      scorerAuthority: 'host_private_exam',
      sourceRef: `cos_university_exam:${row.id}`,
      evidence: {
        profile: COS_UNIVERSITY_EXAM_PROFILE,
        scorerVersion: COS_UNIVERSITY_EXAM_SCORER,
        manifestHash: exam.manifestHash,
        turnId,
        responseSource: result.provenance.responseSource,
        localModelInvoked: result.provenance.localModelInvoked,
        externalAiInvoked: result.provenance.externalAiInvoked,
        reasons: score.reasons,
      },
      observedAt: observedAt.toISOString(),
      validUntil: universityExamValidUntil(target, observedAt),
    })
  }

  const terminalStatus = freshExecution ? (score.passed ? 'passed' : 'failed') : 'error'
  const reasons = freshExecution ? score.reasons : [...score.reasons, 'fresh_execution_required']
  const completedAt = new Date().toISOString()
  const update = await db.from('cos_university_exam_runs').update({
    status: terminalStatus,
    passed: freshExecution ? score.passed : null,
    turn_id: turnId || null,
    response_source: result.provenance.responseSource,
    local_model_invoked: Boolean(result.provenance.localModelInvoked),
    external_ai_invoked: Boolean(result.provenance.externalAiInvoked),
    fresh_execution: freshExecution,
    provenance_recorded: Boolean(turnId),
    reasons,
    latency_ms: latencyMs,
    completed_at: completedAt,
    updated_at: completedAt,
  }).eq('id', row.id)
  if (update.error) throw update.error

  return {
    runId: row.id,
    target,
    status: terminalStatus,
    passed: freshExecution ? score.passed : null,
    assessmentRecorded,
    manifestHash: exam.manifestHash,
    reasons,
    latencyMs,
  }
}

async function runTarget(agentId: string, target: CosUniversityExamTarget, now: Date, readyPlan?: ReadyStudyPlan): Promise<CosUniversityExamRunSummary> {
  const row = await createOrFindRun(agentId, target, now, readyPlan)
  if (!row) return { runId: null, target, status: 'error', passed: null, assessmentRecorded: false, manifestHash: null, reasons: ['service_database_unavailable'], latencyMs: null }
  const canonicalTarget = targetFromRun(row) || target
  if (row.status === 'passed' || row.status === 'failed') {
    return { runId: row.id, target: canonicalTarget, status: 'already_complete', passed: row.passed, assessmentRecorded: true, manifestHash: row.manifest_hash, reasons: row.reasons || [], latencyMs: row.latency_ms }
  }
  if (row.status !== 'created') {
    return { runId: row.id, target: canonicalTarget, status: 'not_claimed', passed: null, assessmentRecorded: false, manifestHash: row.manifest_hash, reasons: [`run_status:${row.status}`], latencyMs: row.latency_ms }
  }
  const claimed = await claimCreatedRun(row, now)
  if (!claimed) return { runId: row.id, target: canonicalTarget, status: 'not_claimed', passed: null, assessmentRecorded: false, manifestHash: row.manifest_hash, reasons: ['concurrent_claim'], latencyMs: null }
  return executeExam(agentId, row, canonicalTarget, now)
}

export async function runCosUniversityIndependentExamBatch(options: {
  agentId?: string
  now?: Date
  maxExams?: number
  assessmentRows?: CosUniversityExamAssessmentRow[]
  readyStudyPlansOnly?: boolean
} = {}): Promise<CosUniversityExamBatchSummary> {
  if (process.env.COS_UNIVERSITY_EXAMS_ENABLED !== 'true') {
    return { enabled: false, attempted: 0, passed: 0, failed: 0, assessmentRowsWritten: 0, runs: [], errors: [], semantics: 'host_seeded_independent_exam_no_self_grading' }
  }

  const now = options.now instanceof Date ? options.now : new Date()
  const agentId = String(options.agentId || DEFAULT_AGENT_ID).trim()
  if (!agentId) return { enabled: true, attempted: 0, passed: 0, failed: 0, assessmentRowsWritten: 0, runs: [], errors: ['agent_id_required'], semantics: 'host_seeded_independent_exam_no_self_grading' }
  const maxExams = Math.max(1, Math.min(2, Math.floor(options.maxExams || 2)))
  const errors: string[] = []
  let rows = options.assessmentRows || []
  try {
    if (!options.assessmentRows) rows = await loadAssessmentRows(agentId)
  } catch (error) {
    errors.push(`assessment_rows:${error instanceof Error ? error.message : String(error)}`)
    return { enabled: true, attempted: 0, passed: 0, failed: 0, assessmentRowsWritten: 0, runs: [], errors, semantics: 'host_seeded_independent_exam_no_self_grading' }
  }

  let readyPlans: ReadyStudyPlan[] = []
  try {
    if (options.readyStudyPlansOnly) readyPlans = await loadReadyStudyPlans(agentId, maxExams)
  } catch (error) {
    errors.push(`ready_study_plans:${error instanceof Error ? error.message : String(error)}`)
    return { enabled: true, attempted: 0, passed: 0, failed: 0, assessmentRowsWritten: 0, runs: [], errors, semantics: 'host_seeded_independent_exam_no_self_grading' }
  }
  const targets = options.readyStudyPlansOnly
    ? readyPlans.map((plan) => plan.target)
    : selectCosUniversityExamTargets(rows, now).slice(0, maxExams)
  const runs: CosUniversityExamRunSummary[] = []
  for (const [index, target] of targets.entries()) {
    try {
      const readyPlan = options.readyStudyPlansOnly ? readyPlans[index] : undefined
      const run = await runTarget(agentId, target, now, readyPlan)
      runs.push(run)
      if (readyPlan) await reconcileReadyStudyPlan(readyPlan.id, run)
    } catch (error) {
      errors.push(`${targetKey(target)}:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    enabled: true,
    attempted: runs.filter(run => run.status === 'passed' || run.status === 'failed').length,
    passed: runs.filter(run => run.status === 'passed').length,
    failed: runs.filter(run => run.status === 'failed').length,
    assessmentRowsWritten: runs.filter(run => run.assessmentRecorded && run.status !== 'already_complete').length,
    runs,
    errors,
    semantics: 'host_seeded_independent_exam_no_self_grading',
  }
}
