// saas/lib/ai/cos/cosUniversityARangeRunner.ts
import { createHash, randomUUID } from 'node:crypto'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { cosUniversityAcademicExecutionBlocker } from './cosUniversityAcademicExecutionPolicy.ts'
import { SOFTWARE_CAPSTONE_RUNTIME, type AgentCapstoneExecution } from './cosUniversityAgentCapstone.ts'
import { executeBoundAgentExam, hasBoundAcademicExecutor } from './cosUniversityAgentExamRuntime.ts'
import { recordCosUniversityAssessment } from './cosUniversityStore.ts'
import { COS_UNIVERSITY_SUBJECTS, classifyCosUniversitySubjects, type CosUniversitySubjectId } from './cosUniversity.ts'
import {
  COS_UNIVERSITY_A_RANGE_PROFILE,
  COS_UNIVERSITY_A_RANGE_SCORER,
  aRangeStagePassesSinceLatestFailure,
  aRangeStageThresholdMet,
  buildCosUniversityARangeExam,
  isCosUniversityVerifiedProductionSource,
  scoreCosUniversityARangeExam,
  universityARangeValidUntil,
  type CosUniversityARangeRunEvidence,
  type CosUniversityARangeStage,
} from './cosUniversityARange.ts'

const AGENT_ID = 'cos'

/** COS keeps its original run keys; every other registered agent is namespaced so ledgers never collide. */
export function cosUniversityARangeExamRunKey(input: { agentId: string; stage: string; day: string; subjectId: string }): string {
  return input.agentId === AGENT_ID
    ? `${COS_UNIVERSITY_A_RANGE_PROFILE}:${input.stage}:${input.day}:${input.subjectId}`
    : `${COS_UNIVERSITY_A_RANGE_PROFILE}:${input.agentId}:${input.stage}:${input.day}:${input.subjectId}`
}

type AssessmentRow = {
  assessment_key: string
  subject_id: CosUniversitySubjectId | null
  assessment_kind: string
  passed: boolean
  independent_scorer: boolean
  scorer_authority: string
  observed_at: string
  valid_until: string
}

type ARangeRunRow = {
  id: string
  run_key: string
  stage: CosUniversityARangeStage
  subject_id: CosUniversitySubjectId
  profile: string
  scorer_version: string
  seed: string | null
  manifest_hash: string
  variant_hash: string
  source_ref: string | null
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

type ProductionOutcomeRow = {
  turn_id: string
  verified_success: boolean | null
  repair_needed: boolean | null
  escalated: boolean | null
  outcome_source: string | null
  outcome_at: string | null
}

export type CosUniversityARangeBatchSummary = {
  enabled: boolean
  /** Set when the agent has no bound executor; no exam was created, executed, or graded. */
  blocked?: string
  productionCandidates: number
  productionEvidenceRecorded: number
  attempted: number
  passed: number
  failed: number
  assessmentRowsWritten: number
  runs: Array<{
    runId: string | null
    stage: CosUniversityARangeStage
    subjectId: CosUniversitySubjectId
    status: string
    passed: boolean | null
    assessmentRecorded: boolean
    reasons: string[]
  }>
  errors: string[]
  semantics: 'repeated_distinct_transfer_plus_exact_turn_production_plus_capstone'
}

function clean(value: unknown, max = 1000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function stableHash(...parts: unknown[]): string {
  return createHash('sha256').update(parts.map(part => clean(part, 2000)).join('|')).digest('hex')
}

function stageAuthority(stage: CosUniversityARangeStage): 'host_private_exam' | 'verified_production' | 'host_capstone' {
  if (stage === 'production_transfer') return 'verified_production'
  if (stage === 'capstone') return 'host_capstone'
  return 'host_private_exam'
}

function validFresh(row: AssessmentRow, nowMs: number): boolean {
  const observed = Date.parse(String(row.observed_at || ''))
  const validUntil = Date.parse(String(row.valid_until || ''))
  return row.independent_scorer === true
    && Number.isFinite(observed)
    && Number.isFinite(validUntil)
    && observed < validUntil
    && validUntil > nowMs
}

function successfulUnseenPassesSinceFailure(rows: AssessmentRow[], subjectId: CosUniversitySubjectId, nowMs: number): number {
  const relevant = rows
    .filter(row => row.subject_id === subjectId && row.assessment_kind === 'unseen_subject_exam' && validFresh(row, nowMs))
    .slice()
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
  let passes = 0
  for (const row of relevant) {
    if (!row.passed) passes = 0
    else if (row.scorer_authority === 'host_private_exam') passes += 1
  }
  return passes
}

function latestStageAssessmentPassed(rows: AssessmentRow[], subjectId: CosUniversitySubjectId, stage: CosUniversityARangeStage, nowMs: number): boolean {
  const row = rows
    .filter(item => item.subject_id === subjectId && item.assessment_kind === stage && validFresh(item, nowMs))
    .slice()
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0]
  return row?.passed === true && row.scorer_authority === stageAuthority(stage)
}

function runEvidence(rows: ARangeRunRow[]): CosUniversityARangeRunEvidence[] {
  return rows
    .filter(row => (row.status === 'passed' || row.status === 'failed') && row.passed !== null)
    .map(row => ({
      stage: row.stage,
      subjectId: row.subject_id,
      passed: row.passed === true,
      variantHash: row.variant_hash,
      observedAt: row.observed_at,
    }))
}

async function loadAssessmentRows(agentId: string): Promise<AssessmentRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_assessments')
    .select('assessment_key,subject_id,assessment_kind,passed,independent_scorer,scorer_authority,observed_at,valid_until')
    .eq('agent_id', agentId)
    .order('observed_at', { ascending: false })
    .limit(5000)
  if (result.error) throw result.error
  return (result.data || []) as AssessmentRow[]
}

async function loadRunRows(agentId: string): Promise<ARangeRunRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_a_range_runs')
    .select('id,run_key,stage,subject_id,profile,scorer_version,seed,manifest_hash,variant_hash,source_ref,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at')
    .eq('agent_id', agentId)
    .order('observed_at', { ascending: false })
    .limit(5000)
  if (result.error) throw result.error
  return (result.data || []) as ARangeRunRow[]
}

async function recordStageAssessment(args: {
  agentId: string
  executionProvenance?: AgentCapstoneExecution | null
  stage: CosUniversityARangeStage
  subjectId: CosUniversitySubjectId
  run: ARangeRunRow
  allRuns: ARangeRunRow[]
}): Promise<boolean> {
  const observedAt = new Date(args.run.observed_at)
  if (!Number.isFinite(observedAt.getTime())) return false
  const authority = stageAuthority(args.stage)

  if (args.run.passed === false) {
    return recordCosUniversityAssessment({
      assessmentKey: `cos-university-a-range-failure:${args.run.id}`,
      agentId: args.agentId,
      subjectId: args.subjectId,
      kind: args.stage,
      passed: false,
      independentScorer: true,
      scorerVersion: COS_UNIVERSITY_A_RANGE_SCORER,
      scorerAuthority: authority,
      sourceRef: `cos_university_a_range:${args.run.id}`,
      evidence: { runId: args.run.id, variantHash: args.run.variant_hash, turnId: args.run.turn_id, threshold: 2, executionProvenance: args.executionProvenance || null },
      observedAt: observedAt.toISOString(),
      validUntil: universityARangeValidUntil(args.stage, observedAt),
    })
  }

  const evidence = runEvidence(args.allRuns)
  if (!aRangeStageThresholdMet(evidence, args.stage, args.subjectId)) return false
  const relevant = args.allRuns
    .filter(row => row.stage === args.stage && row.subject_id === args.subjectId && row.passed === true && (row.status === 'passed'))
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
  const thresholdFingerprint = stableHash(...relevant.slice(-2).map(row => row.variant_hash))
  return recordCosUniversityAssessment({
    assessmentKey: args.agentId === AGENT_ID
      ? `cos-university-a-range-pass:${args.stage}:${args.subjectId}:${thresholdFingerprint}`
      : `cos-university-a-range-pass:${args.agentId}:${args.stage}:${args.subjectId}:${thresholdFingerprint}`,
    agentId: args.agentId,
    subjectId: args.subjectId,
    kind: args.stage,
    passed: true,
    independentScorer: true,
    scorerVersion: COS_UNIVERSITY_A_RANGE_SCORER,
    scorerAuthority: authority,
    sourceRef: `cos_university_a_range:${args.run.id}`,
    evidence: {
      runId: args.run.id,
      threshold: 2,
      distinctPassesSinceLatestFailure: aRangeStagePassesSinceLatestFailure(evidence, args.stage, args.subjectId),
      variantHashes: relevant.slice(-2).map(row => row.variant_hash),
      turnId: args.run.turn_id,
      executionProvenance: args.executionProvenance || null,
    },
    observedAt: observedAt.toISOString(),
    validUntil: universityARangeValidUntil(args.stage, observedAt),
  })
}

async function syncVerifiedProductionOutcomes(now: Date): Promise<{ candidates: number; recorded: number }> {
  const db = cosServiceDb()
  if (!db) return { candidates: 0, recorded: 0 }
  const result = await db.from('cos_turn_outcomes')
    .select('turn_id,verified_success,repair_needed,escalated,outcome_source,outcome_at')
    .like('outcome_source', 'production_verified:%')
    .order('outcome_at', { ascending: true })
    .limit(300)
  if (result.error) throw result.error
  const outcomes = (result.data || []) as ProductionOutcomeRow[]
  let recorded = 0

  for (const outcome of outcomes) {
    const source = clean(outcome.outcome_source, 120)
    const outcomeAt = clean(outcome.outcome_at, 80)
    if (outcome.verified_success === null || !outcomeAt || !isCosUniversityVerifiedProductionSource(source)) continue
    const experience = await db.from('cos_turn_experience').select('problem_class').eq('turn_id', outcome.turn_id).maybeSingle()
    if (experience.error) throw experience.error
    const subjects = classifyCosUniversitySubjects(experience.data?.problem_class || '')
    if (!subjects.length) continue

    for (const subjectId of subjects.slice(0, 4)) {
      const runKey = `production:${outcome.turn_id}:${subjectId}:${outcomeAt}`
      const variantHash = stableHash(outcome.turn_id, source, outcomeAt, subjectId)
      const insert = await db.from('cos_university_a_range_runs').upsert({
        run_key: runKey,
        agent_id: AGENT_ID,
        stage: 'production_transfer',
        subject_id: subjectId,
        profile: COS_UNIVERSITY_A_RANGE_PROFILE,
        scorer_version: COS_UNIVERSITY_A_RANGE_SCORER,
        seed: null,
        manifest_hash: variantHash,
        variant_hash: variantHash,
        source_ref: source,
        status: outcome.verified_success ? 'passed' : 'failed',
        passed: outcome.verified_success,
        turn_id: outcome.turn_id,
        response_source: 'production_outcome',
        local_model_invoked: false,
        external_ai_invoked: false,
        fresh_execution: true,
        reasons: outcome.verified_success ? [] : ['verified_production_failure'],
        observed_at: outcomeAt,
        completed_at: outcomeAt,
        updated_at: now.toISOString(),
      }, { onConflict: 'run_key', ignoreDuplicates: true })
      if (insert.error) throw insert.error
      const rowResult = await db.from('cos_university_a_range_runs')
        .select('id,run_key,stage,subject_id,profile,scorer_version,seed,manifest_hash,variant_hash,source_ref,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at')
        .eq('run_key', runKey).maybeSingle()
      if (rowResult.error) throw rowResult.error
      if (!rowResult.data) continue
      const allRuns = await loadRunRows(AGENT_ID)
      const wrote = await recordStageAssessment({ agentId: AGENT_ID, stage: 'production_transfer', subjectId, run: rowResult.data as ARangeRunRow, allRuns })
      if (wrote) recorded += 1
    }
  }
  return { candidates: outcomes.length, recorded }
}

function eligibleTarget(args: {
  stage: Extract<CosUniversityARangeStage, 'cross_domain_transfer' | 'capstone'>
  assessments: AssessmentRow[]
  runs: ARangeRunRow[]
  now: Date
}): CosUniversitySubjectId | null {
  const nowMs = args.now.getTime()
  const evidence = runEvidence(args.runs)
  const candidates = COS_UNIVERSITY_SUBJECTS.map(subject => subject.id).filter(subjectId => {
    if (aRangeStageThresholdMet(evidence, args.stage, subjectId)) return false
    if (args.stage === 'cross_domain_transfer') return successfulUnseenPassesSinceFailure(args.assessments, subjectId, nowMs) >= 2
    return latestStageAssessmentPassed(args.assessments, subjectId, 'production_transfer', nowMs)
  })
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const aCount = aRangeStagePassesSinceLatestFailure(evidence, args.stage, a)
    const bCount = aRangeStagePassesSinceLatestFailure(evidence, args.stage, b)
    return aCount - bCount || a.localeCompare(b)
  })
  const day = Math.floor(nowMs / 86_400_000)
  const minimum = aRangeStagePassesSinceLatestFailure(evidence, args.stage, candidates[0])
  const tied = candidates.filter(subjectId => aRangeStagePassesSinceLatestFailure(evidence, args.stage, subjectId) === minimum)
  return tied[Math.abs(day + (args.stage === 'capstone' ? 17 : 0)) % tied.length]
}

async function createOrFindExamRun(agentId: string, stage: Extract<CosUniversityARangeStage, 'cross_domain_transfer' | 'capstone'>, subjectId: CosUniversitySubjectId, now: Date): Promise<ARangeRunRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const runKey = cosUniversityARangeExamRunKey({ agentId, stage, day: dayKey(now), subjectId })
  const existing = await db.from('cos_university_a_range_runs')
    .select('id,run_key,stage,subject_id,profile,scorer_version,seed,manifest_hash,variant_hash,source_ref,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at')
    .eq('run_key', runKey).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data as ARangeRunRow

  const seed = randomUUID()
  const exam = buildCosUniversityARangeExam({ seed, stage, subjectId })
  const insert = await db.from('cos_university_a_range_runs').insert({
    run_key: runKey,
    agent_id: agentId,
    stage,
    subject_id: subjectId,
    profile: exam.profile,
    scorer_version: exam.scorerVersion,
    seed,
    manifest_hash: exam.manifestHash,
    variant_hash: exam.manifestHash,
    source_ref: 'host_private_exam',
    status: 'created',
    observed_at: now.toISOString(),
  }).select('id,run_key,stage,subject_id,profile,scorer_version,seed,manifest_hash,variant_hash,source_ref,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at').maybeSingle()
  if (!insert.error && insert.data) return insert.data as ARangeRunRow
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') throw insert.error
  const retry = await db.from('cos_university_a_range_runs')
    .select('id,run_key,stage,subject_id,profile,scorer_version,seed,manifest_hash,variant_hash,source_ref,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at')
    .eq('run_key', runKey).maybeSingle()
  if (retry.error) throw retry.error
  return (retry.data || null) as ARangeRunRow | null
}

async function executeExamRun(agentId: string, row: ARangeRunRow, now: Date): Promise<CosUniversityARangeBatchSummary['runs'][number]> {
  const db = cosServiceDb()
  if (!db || !row.seed) return { runId: row.id, stage: row.stage, subjectId: row.subject_id, status: 'error', passed: null, assessmentRecorded: false, reasons: ['service_database_unavailable_or_seed_missing'] }
  const exam = buildCosUniversityARangeExam({ seed: row.seed, stage: row.stage as 'cross_domain_transfer' | 'capstone', subjectId: row.subject_id })
  if (exam.manifestHash !== row.manifest_hash || row.profile !== exam.profile || row.scorer_version !== exam.scorerVersion) {
    const reasons = ['exam_manifest_drift']
    await db.from('cos_university_a_range_runs').update({ status: 'error', reasons, updated_at: now.toISOString(), completed_at: now.toISOString() }).eq('id', row.id)
    return { runId: row.id, stage: row.stage, subjectId: row.subject_id, status: 'error', passed: null, assessmentRecorded: false, reasons }
  }
  const claim = await db.from('cos_university_a_range_runs').update({ status: 'running', started_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', row.id).eq('status', 'created').select('id').maybeSingle()
  if (claim.error) throw claim.error
  if (!claim.data) return { runId: row.id, stage: row.stage, subjectId: row.subject_id, status: row.status, passed: row.passed, assessmentRecorded: false, reasons: ['not_claimed'] }

  const started = Date.now()
  const failRun = async (reasons: string[]) => {
    const at = new Date().toISOString()
    await db.from('cos_university_a_range_runs').update({ status: 'error', reasons, completed_at: at, updated_at: at }).eq('id', row.id)
    return { runId: row.id, stage: row.stage, subjectId: row.subject_id, status: 'error' as const, passed: null, assessmentRecorded: false, reasons }
  }

  let reply = ''
  let turnId: string | null = null
  let responseSource: string | null = null
  let localModelInvoked = false
  let externalAiInvoked = false
  let semanticCache = false
  let handled = false
  let executionProvenance: AgentCapstoneExecution | null = null

  // A registered agent with its own bound executor answers as itself, through its assigned model.
  // COS keeps its existing reasoner path unchanged.
  if (agentId !== AGENT_ID) {
    let bound: Awaited<ReturnType<typeof executeBoundAgentExam>>
    try {
      bound = await executeBoundAgentExam(
        { agentId, runId: row.id, manifestHash: exam.manifestHash, prompt: exam.prompt },
        { subjectId: row.subject_id },
      )
    } catch (error) {
      return failRun([`execution_error:${error instanceof Error ? error.message : String(error)}`])
    }
    const execution = bound.execution
    if (execution.agentId !== agentId || execution.runId !== row.id || execution.manifestHash !== exam.manifestHash) {
      return failRun(['agent_execution_identity_mismatch'])
    }
    reply = bound.reply
    turnId = execution.turnId
    responseSource = SOFTWARE_CAPSTONE_RUNTIME
    localModelInvoked = true
    handled = true
    executionProvenance = execution
  } else {
    beginEvidenceSourceUseTurn()
    let result: Awaited<ReturnType<typeof tryCOSFirstAnswer>>
    try {
      if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
        await ensureLocalInferenceRuntimeReady()
        await generateLocalEmbedding(exam.prompt)
      }
      result = await tryCOSFirstAnswer({ prompt: exam.prompt, language: 'en', privileged: true, disableCache: true })
    } catch (error) {
      flushCapturedEvidenceSourceUse()
      return failRun([`execution_error:${error instanceof Error ? error.message : String(error)}`])
    }
    reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
    turnId = peekEvidenceSourceUseTurnId()
    responseSource = result.provenance.responseSource
    localModelInvoked = Boolean(result.provenance.localModelInvoked)
    externalAiInvoked = Boolean(result.provenance.externalAiInvoked)
    semanticCache = responseSource === 'semantic_cache' || responseSource === 'semantic_similarity'
    handled = result.handled
  }

  const provenance = { localReasoning: localModelInvoked, externalAi: externalAiInvoked, semanticCache, handled, turnId }
  const score = scoreCosUniversityARangeExam(exam, reply, provenance)
  const freshExecution = Boolean(handled && localModelInvoked && !externalAiInvoked && !semanticCache && turnId)
  const passed = freshExecution ? score.passed : null
  const status = freshExecution ? (score.passed ? 'passed' : 'failed') : 'error'
  const reasons = freshExecution ? score.reasons : [...score.reasons, 'fresh_execution_required']
  const completedAt = new Date().toISOString()
  flushCapturedEvidenceSourceUse()

  const update = await db.from('cos_university_a_range_runs').update({
    status,
    passed,
    turn_id: turnId || null,
    response_source: responseSource,
    local_model_invoked: localModelInvoked,
    external_ai_invoked: externalAiInvoked,
    fresh_execution: freshExecution,
    execution_provenance: executionProvenance,
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
      escalated: !handled,
      source: `cos_university_a_range:${row.id}`,
    })
  }

  const refreshed = await db.from('cos_university_a_range_runs')
    .select('id,run_key,stage,subject_id,profile,scorer_version,seed,manifest_hash,variant_hash,source_ref,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at')
    .eq('id', row.id).maybeSingle()
  if (refreshed.error) throw refreshed.error
  const terminal = (refreshed.data || { ...row, status, passed, turn_id: turnId, reasons }) as ARangeRunRow
  const allRuns = await loadRunRows(agentId)
  const assessmentRecorded = freshExecution
    ? await recordStageAssessment({ agentId, executionProvenance, stage: row.stage, subjectId: row.subject_id, run: terminal, allRuns })
    : false
  return { runId: row.id, stage: row.stage, subjectId: row.subject_id, status, passed, assessmentRecorded, reasons }
}

export async function runCosUniversityARangeBatch(options: { now?: Date; agentId?: string } = {}): Promise<CosUniversityARangeBatchSummary> {
  if (process.env.COS_UNIVERSITY_A_RANGE_ENABLED !== 'true') {
    return { enabled: false, productionCandidates: 0, productionEvidenceRecorded: 0, attempted: 0, passed: 0, failed: 0, assessmentRowsWritten: 0, runs: [], errors: [], semantics: 'repeated_distinct_transfer_plus_exact_turn_production_plus_capstone' }
  }
  const now = options.now instanceof Date ? options.now : new Date()
  const agentId = String(options.agentId || AGENT_ID).trim()
  const errors: string[] = []
  let productionCandidates = 0
  let productionEvidenceRecorded = 0
  // cos_turn_outcomes are COS's own verified Production turns. Attributing them to another agent would
  // fabricate that agent's practical work, so other agents earn production_transfer from their own
  // applied-knowledge outcomes (cosUniversityAppliedKnowledge), never from this bridge.
  if (agentId === AGENT_ID) {
    try {
      const synced = await syncVerifiedProductionOutcomes(now)
      productionCandidates = synced.candidates
      productionEvidenceRecorded = synced.recorded
    } catch (error) {
      errors.push(`production_bridge:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // COS uses its own reasoner; any other agent needs its own bound executor before it can be graded.
  let blocked = cosUniversityAcademicExecutionBlocker(agentId)
  if (blocked && await hasBoundAcademicExecutor(agentId).catch(() => false)) blocked = null
  if (blocked) {
    return {
      enabled: true, blocked, productionCandidates, productionEvidenceRecorded, attempted: 0, passed: 0, failed: 0,
      assessmentRowsWritten: productionEvidenceRecorded, runs: [], errors,
      semantics: 'repeated_distinct_transfer_plus_exact_turn_production_plus_capstone',
    }
  }

  let assessments: AssessmentRow[] = []
  let runs: ARangeRunRow[] = []
  try {
    assessments = await loadAssessmentRows(agentId)
    runs = await loadRunRows(agentId)
  } catch (error) {
    errors.push(`evidence_load:${error instanceof Error ? error.message : String(error)}`)
  }

  const targets: Array<{ stage: 'cross_domain_transfer' | 'capstone'; subjectId: CosUniversitySubjectId }> = []
  const transfer = eligibleTarget({ stage: 'cross_domain_transfer', assessments, runs, now })
  if (transfer) targets.push({ stage: 'cross_domain_transfer', subjectId: transfer })
  const capstone = eligibleTarget({ stage: 'capstone', assessments, runs, now })
  if (capstone) targets.push({ stage: 'capstone', subjectId: capstone })

  const results: CosUniversityARangeBatchSummary['runs'] = []
  for (const target of targets) {
    try {
      const row = await createOrFindExamRun(agentId, target.stage, target.subjectId, now)
      if (!row) {
        results.push({ runId: null, ...target, status: 'error', passed: null, assessmentRecorded: false, reasons: ['service_database_unavailable'] })
        continue
      }
      if (row.status === 'passed' || row.status === 'failed' || row.status === 'error') {
        results.push({ runId: row.id, ...target, status: `already_${row.status}`, passed: row.passed, assessmentRecorded: false, reasons: row.reasons || [] })
        continue
      }
      results.push(await executeExamRun(agentId, row, now))
    } catch (error) {
      errors.push(`${target.stage}:${target.subjectId}:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    enabled: true,
    productionCandidates,
    productionEvidenceRecorded,
    attempted: results.filter(row => row.status === 'passed' || row.status === 'failed').length,
    passed: results.filter(row => row.passed === true).length,
    failed: results.filter(row => row.passed === false).length,
    assessmentRowsWritten: productionEvidenceRecorded + results.filter(row => row.assessmentRecorded).length,
    runs: results,
    errors,
    semantics: 'repeated_distinct_transfer_plus_exact_turn_production_plus_capstone',
  }
}
