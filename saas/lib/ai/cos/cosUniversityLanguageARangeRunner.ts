import { createHash, randomUUID } from 'node:crypto'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { recordCosUniversityAssessment } from './cosUniversityStore.ts'
import { type CosUniversityAssessmentKind } from './cosUniversity.ts'
import {
  COS_PLATFORM_LANGUAGES,
  type CosPlatformLanguage,
  type CosPlatformLanguageDimension,
} from './cosUniversityLanguages.ts'
import {
  COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE,
  COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER,
  COS_UNIVERSITY_LANGUAGE_DIMENSIONS,
  buildCosUniversityLanguageARangeExam,
  languageARangeStagePassesSinceLatestFailure,
  languageARangeStageThresholdMet,
  parseCosUniversityVerifiedLanguageProductionSource,
  scoreCosUniversityLanguageARangeExam,
  universityLanguageARangeValidUntil,
  type CosUniversityLanguageARangeRunEvidence,
  type CosUniversityLanguageARangeStage,
  type CosUniversityLanguageARangeTarget,
} from './cosUniversityLanguageARange.ts'

const AGENT_ID = 'cos'

/** COS keeps historical keys; every other agent is namespaced to prevent evidence collisions. */
export function cosUniversityLanguageARangeRunKey(input: { agentId: string; stage: string; day: string; targetKey: string }): string {
  return input.agentId === AGENT_ID
    ? `${COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE}:${input.stage}:${input.day}:${input.targetKey}`
    : `${COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE}:${input.agentId}:${input.stage}:${input.day}:${input.targetKey}`
}

type AssessmentRow = {
  assessment_key: string
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
  assessment_kind: CosUniversityAssessmentKind
  passed: boolean
  independent_scorer: boolean
  scorer_authority: string
  observed_at: string
  valid_until: string
}

type LanguageARangeRunRow = {
  id: string
  run_key: string
  target_kind: 'subject' | 'language'
  stage: CosUniversityLanguageARangeStage
  subject_id: string | null
  language_code: CosPlatformLanguage | null
  language_dimension: CosPlatformLanguageDimension | null
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

export type CosUniversityLanguageARangeBatchSummary = {
  enabled: boolean
  productionCandidates: number
  productionEvidenceRecorded: number
  attempted: number
  passed: number
  failed: number
  assessmentRowsWritten: number
  runs: Array<{
    runId: string | null
    stage: Extract<CosUniversityLanguageARangeStage, 'cross_domain_transfer' | 'capstone'>
    language: CosPlatformLanguage
    dimension: CosPlatformLanguageDimension | null
    status: string
    passed: boolean | null
    assessmentRowsRecorded: number
    reasons: string[]
  }>
  errors: string[]
  semantics: 'five_language_repeated_transfer_exact_production_integrated_capstone'
}

const RUN_SELECT = 'id,run_key,target_kind,stage,subject_id,language_code,language_dimension,profile,scorer_version,seed,manifest_hash,variant_hash,source_ref,status,passed,turn_id,response_source,local_model_invoked,external_ai_invoked,fresh_execution,reasons,latency_ms,observed_at'

function clean(value: unknown, max = 1000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function stableHash(...parts: unknown[]): string {
  return createHash('sha256').update(parts.map(part => clean(part, 2000)).join('|')).digest('hex')
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
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

function successfulUnseenPassesSinceFailure(
  rows: AssessmentRow[],
  language: CosPlatformLanguage,
  dimension: CosPlatformLanguageDimension,
  nowMs: number,
): number {
  const relevant = rows
    .filter(row => row.language_code === language
      && row.language_dimension === dimension
      && row.assessment_kind === 'unseen_subject_exam'
      && validFresh(row, nowMs))
    .slice()
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
  let passes = 0
  for (const row of relevant) {
    if (!row.passed) passes = 0
    else if (row.scorer_authority === 'host_private_exam') passes += 1
  }
  return passes
}

function latestStagePassed(
  rows: AssessmentRow[],
  language: CosPlatformLanguage,
  dimension: CosPlatformLanguageDimension,
  stage: 'production_transfer',
  nowMs: number,
): boolean {
  const row = rows
    .filter(item => item.language_code === language
      && item.language_dimension === dimension
      && item.assessment_kind === stage
      && validFresh(item, nowMs))
    .slice()
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0]
  return row?.passed === true && row.scorer_authority === 'verified_production'
}

function allProductionDimensionsPassed(rows: AssessmentRow[], language: CosPlatformLanguage, nowMs: number): boolean {
  return COS_UNIVERSITY_LANGUAGE_DIMENSIONS.every(dimension => latestStagePassed(rows, language, dimension, 'production_transfer', nowMs))
}

function runEvidence(rows: LanguageARangeRunRow[]): CosUniversityLanguageARangeRunEvidence[] {
  return rows
    .filter(row => row.target_kind === 'language'
      && row.language_code
      && (row.status === 'passed' || row.status === 'failed')
      && row.passed !== null)
    .map(row => ({
      stage: row.stage,
      language: row.language_code as CosPlatformLanguage,
      dimension: row.language_dimension,
      passed: row.passed === true,
      variantHash: row.variant_hash,
      observedAt: row.observed_at,
    }))
}

async function loadAssessmentRows(agentId: string): Promise<AssessmentRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_assessments')
    .select('assessment_key,language_code,language_dimension,assessment_kind,passed,independent_scorer,scorer_authority,observed_at,valid_until')
    .eq('agent_id', agentId)
    .not('language_code', 'is', null)
    .order('observed_at', { ascending: false })
    .limit(5000)
  if (result.error) throw result.error
  return (result.data || []) as AssessmentRow[]
}

async function loadRunRows(agentId: string): Promise<LanguageARangeRunRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_a_range_runs')
    .select(RUN_SELECT)
    .eq('agent_id', agentId)
    .eq('target_kind', 'language')
    .order('observed_at', { ascending: false })
    .limit(5000)
  if (result.error) throw result.error
  return (result.data || []) as LanguageARangeRunRow[]
}

function matchingPassedRuns(args: {
  rows: LanguageARangeRunRow[]
  stage: CosUniversityLanguageARangeStage
  language: CosPlatformLanguage
  dimension: CosPlatformLanguageDimension | null
}): LanguageARangeRunRow[] {
  return args.rows
    .filter(row => row.target_kind === 'language'
      && row.stage === args.stage
      && row.language_code === args.language
      && row.language_dimension === args.dimension
      && row.status === 'passed'
      && row.passed === true)
    .slice()
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at))
}

async function recordOneAssessment(args: {
  agentId: string
  run: LanguageARangeRunRow
  dimension: CosPlatformLanguageDimension
  passed: boolean
  key: string
  evidence: Record<string, unknown>
}): Promise<number> {
  if (!args.run.language_code) return 0
  const observedAt = new Date(args.run.observed_at)
  if (!Number.isFinite(observedAt.getTime())) return 0
  const authority = args.run.stage === 'production_transfer'
    ? 'verified_production'
    : args.run.stage === 'capstone'
      ? 'host_capstone'
      : 'host_private_exam'
  const written = await recordCosUniversityAssessment({
    assessmentKey: args.key,
    agentId: args.agentId,
    language: args.run.language_code,
    languageDimension: args.dimension,
    kind: args.run.stage,
    passed: args.passed,
    independentScorer: true,
    scorerVersion: COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER,
    scorerAuthority: authority,
    sourceRef: `cos_university_language_a_range:${args.run.id}`,
    evidence: args.evidence,
    observedAt: observedAt.toISOString(),
    validUntil: universityLanguageARangeValidUntil(args.run.stage, observedAt),
  })
  return written ? 1 : 0
}

async function recordStageAssessments(args: {
  agentId: string
  run: LanguageARangeRunRow
  allRuns: LanguageARangeRunRow[]
}): Promise<number> {
  const language = args.run.language_code
  if (!language) return 0
  const dimensions = args.run.stage === 'capstone'
    ? [...COS_UNIVERSITY_LANGUAGE_DIMENSIONS]
    : args.run.language_dimension ? [args.run.language_dimension] : []
  if (!dimensions.length) return 0

  if (args.run.passed === false) {
    let written = 0
    for (const dimension of dimensions) {
      written += await recordOneAssessment({
        agentId: args.agentId,
        run: args.run,
        dimension,
        passed: false,
        key: `cos-university-language-a-range-failure:${args.run.id}:${dimension}`,
        evidence: {
          runId: args.run.id,
          language,
          dimension,
          variantHash: args.run.variant_hash,
          turnId: args.run.turn_id,
          threshold: 2,
        },
      })
    }
    return written
  }

  const evidence = runEvidence(args.allRuns)
  if (!languageARangeStageThresholdMet(evidence, args.run.stage, language, args.run.language_dimension)) return 0
  const relevant = matchingPassedRuns({ rows: args.allRuns, stage: args.run.stage, language, dimension: args.run.language_dimension })
  const distinctRecent: LanguageARangeRunRow[] = []
  const seen = new Set<string>()
  for (const row of relevant.slice().reverse()) {
    if (seen.has(row.variant_hash)) continue
    seen.add(row.variant_hash)
    distinctRecent.push(row)
    if (distinctRecent.length === 2) break
  }
  distinctRecent.reverse()
  const thresholdFingerprint = stableHash(...distinctRecent.map(row => row.variant_hash))
  let written = 0
  for (const dimension of dimensions) {
    written += await recordOneAssessment({
      agentId: args.agentId,
      run: args.run,
      dimension,
      passed: true,
      key: args.agentId === AGENT_ID
        ? `cos-university-language-a-range-pass:${args.run.stage}:${language}:${dimension}:${thresholdFingerprint}`
        : `cos-university-language-a-range-pass:${args.agentId}:${args.run.stage}:${language}:${dimension}:${thresholdFingerprint}`,
      evidence: {
        runId: args.run.id,
        language,
        dimension,
        threshold: 2,
        distinctPassesSinceLatestFailure: languageARangeStagePassesSinceLatestFailure(evidence, args.run.stage, language, args.run.language_dimension),
        variantHashes: distinctRecent.map(row => row.variant_hash),
        turnId: args.run.turn_id,
      },
    })
  }
  return written
}

async function syncVerifiedLanguageProductionOutcomes(agentId: string, now: Date): Promise<{ candidates: number; recorded: number }> {
  const db = cosServiceDb()
  if (!db) return { candidates: 0, recorded: 0 }
  // Specialist outcomes carry a host-written agent segment:
  // production_verified:language:<agentId>:<language>:<dimension>.
  // COS retains its historical production_verified:language:<language>:<dimension> form.
  const sourcePrefix = agentId === AGENT_ID
    ? 'production_verified:language:'
    : `production_verified:language:${agentId}:`
  const result = await db.from('cos_turn_outcomes')
    .select('turn_id,verified_success,repair_needed,escalated,outcome_source,outcome_at')
    .like('outcome_source', `${sourcePrefix}%`)
    .order('outcome_at', { ascending: true })
    .limit(300)
  if (result.error) throw result.error
  const outcomes = (result.data || []) as ProductionOutcomeRow[]
  let recorded = 0

  for (const outcome of outcomes) {
    const source = clean(outcome.outcome_source, 240)
    const normalizedSource = agentId === AGENT_ID
      ? source
      : source.replace(sourcePrefix, 'production_verified:language:')
    const parsed = parseCosUniversityVerifiedLanguageProductionSource(normalizedSource)
    const outcomeAt = clean(outcome.outcome_at, 80)
    if (outcome.verified_success === null || !parsed || !outcomeAt || !Number.isFinite(Date.parse(outcomeAt))) continue

    const experience = await db.from('cos_turn_experience').select('turn_id').eq('turn_id', outcome.turn_id).maybeSingle()
    if (experience.error) throw experience.error
    if (!experience.data?.turn_id) continue

    const runKey = agentId === AGENT_ID
      ? `language-production:${outcome.turn_id}:${parsed.language}:${parsed.dimension}:${outcomeAt}`
      : `language-production:${agentId}:${outcome.turn_id}:${parsed.language}:${parsed.dimension}:${outcomeAt}`
    const variantHash = stableHash(outcome.turn_id, source, outcomeAt, parsed.language, parsed.dimension)
    const insert = await db.from('cos_university_a_range_runs').upsert({
      run_key: runKey,
      agent_id: agentId,
      target_kind: 'language',
      stage: 'production_transfer',
      subject_id: null,
      language_code: parsed.language,
      language_dimension: parsed.dimension,
      profile: COS_UNIVERSITY_LANGUAGE_A_RANGE_PROFILE,
      scorer_version: COS_UNIVERSITY_LANGUAGE_A_RANGE_SCORER,
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
      reasons: outcome.verified_success ? [] : ['verified_language_production_failure'],
      observed_at: outcomeAt,
      completed_at: outcomeAt,
      updated_at: now.toISOString(),
    }, { onConflict: 'run_key', ignoreDuplicates: true })
    if (insert.error) throw insert.error

    const rowResult = await db.from('cos_university_a_range_runs')
      .select(RUN_SELECT).eq('run_key', runKey).maybeSingle()
    if (rowResult.error) throw rowResult.error
    if (!rowResult.data) continue
    const allRuns = await loadRunRows(agentId)
    recorded += await recordStageAssessments({ agentId, run: rowResult.data as LanguageARangeRunRow, allRuns })
  }
  return { candidates: outcomes.length, recorded }
}

function eligibleTransferTarget(args: {
  assessments: AssessmentRow[]
  runs: LanguageARangeRunRow[]
  now: Date
}): Extract<CosUniversityLanguageARangeTarget, { stage: 'cross_domain_transfer' }> | null {
  const nowMs = args.now.getTime()
  const evidence = runEvidence(args.runs)
  const candidates = COS_PLATFORM_LANGUAGES.flatMap(language => COS_UNIVERSITY_LANGUAGE_DIMENSIONS.map(dimension => ({
    stage: 'cross_domain_transfer' as const,
    language: language.id,
    dimension,
  }))).filter(target =>
    !languageARangeStageThresholdMet(evidence, 'cross_domain_transfer', target.language, target.dimension)
    && successfulUnseenPassesSinceFailure(args.assessments, target.language, target.dimension, nowMs) >= 2,
  )
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const aCount = languageARangeStagePassesSinceLatestFailure(evidence, a.stage, a.language, a.dimension)
    const bCount = languageARangeStagePassesSinceLatestFailure(evidence, b.stage, b.language, b.dimension)
    return aCount - bCount || `${a.language}:${a.dimension}`.localeCompare(`${b.language}:${b.dimension}`)
  })
  const minimum = languageARangeStagePassesSinceLatestFailure(evidence, candidates[0].stage, candidates[0].language, candidates[0].dimension)
  const tied = candidates.filter(target => languageARangeStagePassesSinceLatestFailure(evidence, target.stage, target.language, target.dimension) === minimum)
  const day = Math.floor(nowMs / 86_400_000)
  return tied[Math.abs(day + 23) % tied.length]
}

function eligibleCapstoneTarget(args: {
  assessments: AssessmentRow[]
  runs: LanguageARangeRunRow[]
  now: Date
}): Extract<CosUniversityLanguageARangeTarget, { stage: 'capstone' }> | null {
  const nowMs = args.now.getTime()
  const evidence = runEvidence(args.runs)
  const candidates = COS_PLATFORM_LANGUAGES
    .map(language => ({ stage: 'capstone' as const, language: language.id, dimension: null }))
    .filter(target => allProductionDimensionsPassed(args.assessments, target.language, nowMs)
      && !languageARangeStageThresholdMet(evidence, 'capstone', target.language, null))
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const aCount = languageARangeStagePassesSinceLatestFailure(evidence, a.stage, a.language, null)
    const bCount = languageARangeStagePassesSinceLatestFailure(evidence, b.stage, b.language, null)
    return aCount - bCount || a.language.localeCompare(b.language)
  })
  const minimum = languageARangeStagePassesSinceLatestFailure(evidence, candidates[0].stage, candidates[0].language, null)
  const tied = candidates.filter(target => languageARangeStagePassesSinceLatestFailure(evidence, target.stage, target.language, null) === minimum)
  const day = Math.floor(nowMs / 86_400_000)
  return tied[Math.abs(day + 41) % tied.length]
}

async function createOrFindExamRun(agentId: string, target: CosUniversityLanguageARangeTarget, now: Date): Promise<LanguageARangeRunRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const targetKey = target.dimension ? `${target.language}:${target.dimension}` : `${target.language}:integrated`
  const runKey = cosUniversityLanguageARangeRunKey({ agentId, stage: target.stage, day: dayKey(now), targetKey })
  const existing = await db.from('cos_university_a_range_runs').select(RUN_SELECT).eq('run_key', runKey).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data as LanguageARangeRunRow

  const seed = randomUUID()
  const exam = buildCosUniversityLanguageARangeExam({ seed, target })
  const insert = await db.from('cos_university_a_range_runs').insert({
    run_key: runKey,
    agent_id: agentId,
    target_kind: 'language',
    stage: target.stage,
    subject_id: null,
    language_code: target.language,
    language_dimension: target.dimension,
    profile: exam.profile,
    scorer_version: exam.scorerVersion,
    seed,
    manifest_hash: exam.manifestHash,
    variant_hash: exam.manifestHash,
    source_ref: target.stage === 'capstone' ? 'host_capstone' : 'host_private_exam',
    status: 'created',
    observed_at: now.toISOString(),
  }).select(RUN_SELECT).maybeSingle()
  if (!insert.error && insert.data) return insert.data as LanguageARangeRunRow
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') throw insert.error
  const retry = await db.from('cos_university_a_range_runs').select(RUN_SELECT).eq('run_key', runKey).maybeSingle()
  if (retry.error) throw retry.error
  return (retry.data || null) as LanguageARangeRunRow | null
}

function targetFromRow(row: LanguageARangeRunRow): CosUniversityLanguageARangeTarget | null {
  if (row.target_kind !== 'language' || !row.language_code) return null
  if (row.stage === 'capstone' && row.language_dimension === null) {
    return { stage: 'capstone', language: row.language_code, dimension: null }
  }
  if (row.stage === 'cross_domain_transfer' && row.language_dimension) {
    return { stage: 'cross_domain_transfer', language: row.language_code, dimension: row.language_dimension }
  }
  return null
}

async function executeExamRun(agentId: string, row: LanguageARangeRunRow, now: Date): Promise<CosUniversityLanguageARangeBatchSummary['runs'][number]> {
  const target = targetFromRow(row)
  if (!target || !row.seed || !row.language_code) {
    return { runId: row.id, stage: row.stage as 'cross_domain_transfer' | 'capstone', language: row.language_code || 'en', dimension: row.language_dimension, status: 'error', passed: null, assessmentRowsRecorded: 0, reasons: ['invalid_language_exam_target'] }
  }
  const db = cosServiceDb()
  if (!db) return { runId: row.id, ...target, status: 'error', passed: null, assessmentRowsRecorded: 0, reasons: ['service_database_unavailable'] }
  const exam = buildCosUniversityLanguageARangeExam({ seed: row.seed, target })
  if (exam.manifestHash !== row.manifest_hash || row.profile !== exam.profile || row.scorer_version !== exam.scorerVersion) {
    const reasons = ['exam_manifest_drift']
    await db.from('cos_university_a_range_runs').update({ status: 'error', reasons, updated_at: now.toISOString(), completed_at: now.toISOString() }).eq('id', row.id)
    return { runId: row.id, ...target, status: 'error', passed: null, assessmentRowsRecorded: 0, reasons }
  }
  const claim = await db.from('cos_university_a_range_runs').update({ status: 'running', started_at: now.toISOString(), updated_at: now.toISOString() }).eq('id', row.id).eq('status', 'created').select('id').maybeSingle()
  if (claim.error) throw claim.error
  if (!claim.data) return { runId: row.id, ...target, status: row.status, passed: row.passed, assessmentRowsRecorded: 0, reasons: ['not_claimed'] }

  const started = Date.now()
  beginEvidenceSourceUseTurn()
  let result: Awaited<ReturnType<typeof tryCOSFirstAnswer>>
  try {
    if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
      await ensureLocalInferenceRuntimeReady()
      await generateLocalEmbedding(exam.prompt)
    }
    result = await tryCOSFirstAnswer({ prompt: exam.prompt, language: row.language_code, privileged: true, disableCache: true })
  } catch (error) {
    flushCapturedEvidenceSourceUse()
    const reasons = [`execution_error:${error instanceof Error ? error.message : String(error)}`]
    await db.from('cos_university_a_range_runs').update({ status: 'error', reasons, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id)
    return { runId: row.id, ...target, status: 'error', passed: null, assessmentRowsRecorded: 0, reasons }
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
  const score = scoreCosUniversityLanguageARangeExam(exam, reply, provenance)
  const freshExecution = Boolean(result.handled && result.provenance.localModelInvoked && !result.provenance.externalAiInvoked && !provenance.semanticCache && turnId)
  const passed = freshExecution ? score.passed : null
  const status = freshExecution ? (score.passed ? 'passed' : 'failed') : 'error'
  const reasons = freshExecution ? score.reasons : [...score.reasons, 'fresh_execution_required']
  const completedAt = new Date().toISOString()
  flushCapturedEvidenceSourceUse()

  const update = await db.from('cos_university_a_range_runs').update({
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
      source: `cos_university_language_a_range:${row.id}`,
    })
  }

  const refreshed = await db.from('cos_university_a_range_runs').select(RUN_SELECT).eq('id', row.id).maybeSingle()
  if (refreshed.error) throw refreshed.error
  const terminal = (refreshed.data || { ...row, status, passed, turn_id: turnId, reasons }) as LanguageARangeRunRow
  const allRuns = await loadRunRows(agentId)
  const assessmentRowsRecorded = freshExecution ? await recordStageAssessments({ agentId, run: terminal, allRuns }) : 0
  return { runId: row.id, ...target, status, passed, assessmentRowsRecorded, reasons }
}

export async function runCosUniversityLanguageARangeBatch(options: { now?: Date; agentId?: string } = {}): Promise<CosUniversityLanguageARangeBatchSummary> {
  const now = options.now instanceof Date ? options.now : new Date()
  const agentId = String(options.agentId || AGENT_ID).trim()
  if (process.env.COS_UNIVERSITY_A_RANGE_ENABLED !== 'true') {
    return { enabled: false, productionCandidates: 0, productionEvidenceRecorded: 0, attempted: 0, passed: 0, failed: 0, assessmentRowsWritten: 0, runs: [], errors: [], semantics: 'five_language_repeated_transfer_exact_production_integrated_capstone' }
  }
  const errors: string[] = []
  let productionCandidates = 0
  let productionEvidenceRecorded = 0
  try {
    const synced = await syncVerifiedLanguageProductionOutcomes(agentId, now)
    productionCandidates = synced.candidates
    productionEvidenceRecorded = synced.recorded
  } catch (error) {
    errors.push(`production_bridge:${error instanceof Error ? error.message : String(error)}`)
  }

  let assessments: AssessmentRow[] = []
  let runs: LanguageARangeRunRow[] = []
  try {
    assessments = await loadAssessmentRows(agentId)
    runs = await loadRunRows(agentId)
  } catch (error) {
    errors.push(`evidence_load:${error instanceof Error ? error.message : String(error)}`)
  }

  const targets: CosUniversityLanguageARangeTarget[] = []
  const transfer = eligibleTransferTarget({ assessments, runs, now })
  if (transfer) targets.push(transfer)
  const capstone = eligibleCapstoneTarget({ assessments, runs, now })
  if (capstone) targets.push(capstone)

  const results: CosUniversityLanguageARangeBatchSummary['runs'] = []
  for (const target of targets) {
    try {
      const row = await createOrFindExamRun(agentId, target, now)
      if (!row) {
        results.push({ runId: null, ...target, status: 'error', passed: null, assessmentRowsRecorded: 0, reasons: ['service_database_unavailable'] })
        continue
      }
      if (row.status === 'passed' || row.status === 'failed' || row.status === 'error') {
        results.push({ runId: row.id, ...target, status: `already_${row.status}`, passed: row.passed, assessmentRowsRecorded: 0, reasons: row.reasons || [] })
        continue
      }
      results.push(await executeExamRun(agentId, row, now))
    } catch (error) {
      errors.push(`${target.stage}:${target.language}:${target.dimension || 'integrated'}:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    enabled: true,
    productionCandidates,
    productionEvidenceRecorded,
    attempted: results.filter(row => row.status === 'passed' || row.status === 'failed').length,
    passed: results.filter(row => row.passed === true).length,
    failed: results.filter(row => row.passed === false).length,
    assessmentRowsWritten: productionEvidenceRecorded + results.reduce((sum, row) => sum + row.assessmentRowsRecorded, 0),
    runs: results,
    errors,
    semantics: 'five_language_repeated_transfer_exact_production_integrated_capstone',
  }
}
