import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { beginEvidenceSourceUseTurn, peekEvidenceSourceUseTurnId } from '@/lib/ai/cos/evidenceSourceUseTurnContext'
import { flushCapturedEvidenceSourceUse } from '@/lib/ai/cos/evidenceSourceUseStore'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { evaluateAnswerAgainstRubric, type CognitivePracticeRubric } from './cognitiveSkillCandidate.ts'
import { refreshCognitiveSkillStatus } from './cognitiveActiveLearning.ts'
import { cosUniversitySubjectById, type CosUniversitySubjectId } from './cosUniversity.ts'
import { type CosPlatformLanguage } from './cosUniversityLanguages.ts'
import {
  COS_UNIVERSITY_PRACTICE_PROFILE,
  COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND,
  buildCosUniversityDeliberatePracticeVariants,
  cosUniversityPracticeSkillKey,
} from './cosUniversityDeliberatePractice.ts'
import { type CosUniversityFailureClass } from './cosUniversityStudyStrategy.ts'

const ORIGIN = 'cos_university_deliberate_practice'
const STALE_RUNNING_AFTER_MS = 8 * 60_000
const DEFAULT_MAX_PLANS = 4
const DEFAULT_MAX_EXERCISES = 2

export type CosUniversityPracticePlanRow = {
  id: string
  plan_key: string
  subject_id: CosUniversitySubjectId
  language_code: CosPlatformLanguage | null
  language_dimension: string | null
  failure_class: CosUniversityFailureClass
  objective: string
  methods: unknown
  evidence: unknown
  priority: number
  status: 'queued' | 'studying' | 'ready_for_exam' | 'completed' | 'superseded'
  attempt_count: number
  last_attempt_at: string | null
}

type PracticeQueueRow = {
  id: string
  skill_key: string
  variant_key: string
  prompt: string
  rubric: CognitivePracticeRubric
  status: string
  attempt_count: number
  max_attempts: number
  metadata: Record<string, unknown> | null
  created_at: string
}

export type CosUniversityPracticeRun = {
  queueId: string
  planId: string | null
  planKey: string | null
  practiceRound: number | null
  variantKey: string
  status: 'passed' | 'failed' | 'deferred' | 'blocked'
  passed: boolean | null
  score: number | null
  coverage: number | null
  turnId: string | null
  reasons: string[]
}

export type CosUniversityDeliberatePracticeSummary = {
  enabled: boolean
  recovered: number
  plansConsidered: number
  plansPrepared: number
  variantsQueued: number
  exercisesAttempted: number
  passed: number
  failed: number
  deferred: number
  readyForExam: number
  runs: CosUniversityPracticeRun[]
  errors: string[]
  semantics: 'practice_is_measured_training_never_academic_credit'
}

function clean(value: unknown, max = 4000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback
}

function hasDeliberatePractice(methods: unknown): boolean {
  if (!Array.isArray(methods)) return false
  return methods.some(item => {
    const row = asRecord(item)
    return row.id === 'deliberate_practice' && row.execution === 'automatic_if_certifiable'
  })
}

async function recoverStalePractice(): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 0
  const cutoff = new Date(Date.now() - STALE_RUNNING_AFTER_MS).toISOString()
  const result = await db.from('cos_active_practice_queue').update({
    status: 'queued',
    started_at: null,
    completed_at: null,
    last_error: 'university_practice_stale_running_recovered',
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
    .eq('status', 'running')
    .eq('generation_source', 'curated')
    .contains('metadata', { origin: ORIGIN })
    .lt('started_at', cutoff)
    .select('id')
  if (result.error) throw result.error
  return result.data?.length || 0
}

async function loadStudyPlans(limit: number): Promise<CosUniversityPracticePlanRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_university_study_plans')
    .select('id,plan_key,subject_id,language_code,language_dimension,failure_class,objective,methods,evidence,priority,status,attempt_count,last_attempt_at')
    .eq('agent_id', 'cos')
    .eq('status', 'studying')
    .gt('attempt_count', 0)
    .order('priority', { ascending: false })
    .order('last_attempt_at', { ascending: false })
    .limit(Math.max(1, Math.min(20, limit * 4)))
  if (result.error) throw result.error
  return (result.data || [])
    .filter(row => hasDeliberatePractice(row.methods))
    .slice(0, limit) as CosUniversityPracticePlanRow[]
}

function universityProcedure(plan: CosUniversityPracticePlanRow): Record<string, unknown> {
  const title = cosUniversitySubjectById(plan.subject_id).title
  return {
    version: 1,
    problemClass: plan.failure_class,
    prerequisites: [title],
    procedureSteps: [
      'Read the current case before using prior expectations.',
      'Retrieve or identify evidence that is actually relevant to the decision.',
      'Separate recorded facts from inference and preserve unresolved facts as unknown.',
      'Apply the primary subject discipline to the case rather than repeating memorized wording.',
      'State the next verification that would most reduce decision uncertainty.',
    ],
    discriminatingSignals: [
      `university_subject=${plan.subject_id}`,
      `failure_class=${plan.failure_class}`,
      plan.language_code ? `language=${plan.language_code}` : 'language=task_defined',
    ],
    tools: ['governed retrieval and authorized read-only evidence where available'],
    observables: ['relevant evidence selected', 'unknowns preserved', 'verification proposed'],
    falsifiers: ['material case fact contradicted', 'unsupported live/Production state claimed'],
    commonFailureModes: ['irrelevant evidence selection', 'invented certainty', 'memorized answer reuse'],
    prohibitedActions: ['do not widen authority', 'do not invent missing facts', 'do not treat practice as an academic grade'],
  }
}

async function ensurePracticeSkill(plan: CosUniversityPracticePlanRow): Promise<string> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const skillKey = cosUniversityPracticeSkillKey(plan.plan_key)
  const existing = await db.from('cos_cognitive_skills').select('id').eq('skill_key', skillKey).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) return skillKey

  const now = new Date().toISOString()
  const insert = await db.from('cos_cognitive_skills').insert({
    skill_key: skillKey,
    subject: cosUniversitySubjectById(plan.subject_id).title,
    title: `University deliberate practice: ${cosUniversitySubjectById(plan.subject_id).title}`,
    description: clean(plan.objective, 1600),
    procedure: universityProcedure(plan),
    status: 'encountered',
    evaluator_approved: false,
    understanding_approved: false,
    encounter_count: 1,
    provenance: {
      origin: ORIGIN,
      universityPlanId: plan.id,
      universityPlanKey: plan.plan_key,
      studyAttempt: plan.attempt_count,
    },
    metadata: {
      origin: ORIGIN,
      universityPlanId: plan.id,
      universityPlanKey: plan.plan_key,
      academicCredit: false,
      activation_rule: 'practice evidence cannot activate this skill or update a University grade without independent evaluation',
      authorityGranted: false,
    },
    updated_at: now,
  })
  if (insert.error && String((insert.error as { code?: string }).code || '') !== '23505') throw insert.error
  return skillKey
}

async function queuePracticeRound(plan: CosUniversityPracticePlanRow): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 0
  const skillKey = await ensurePracticeSkill(plan)
  const variants = buildCosUniversityDeliberatePracticeVariants({
    planKey: plan.plan_key,
    subjectId: plan.subject_id,
    language: plan.language_code,
    failureClass: plan.failure_class,
    objective: plan.objective,
    practiceRound: Math.max(1, Number(plan.attempt_count || 1)),
  })
  let queued = 0
  for (const variant of variants) {
    const result = await db.from('cos_active_practice_queue').upsert({
      skill_key: skillKey,
      teacher_lesson_id: null,
      variant_key: variant.variantKey,
      exercise_kind: 'practice',
      prompt: variant.prompt,
      rubric: variant.rubric,
      generation_source: 'curated',
      evaluator_mode: 'deterministic_rubric',
      max_attempts: 1,
      status: 'queued',
      metadata: {
        origin: ORIGIN,
        profile: COS_UNIVERSITY_PRACTICE_PROFILE,
        academicCredit: false,
        universityPlanId: plan.id,
        universityPlanKey: plan.plan_key,
        subjectId: plan.subject_id,
        languageCode: plan.language_code,
        failureClass: plan.failure_class,
        practiceRound: variant.practiceRound,
        variantIndex: variant.variantIndex,
        manifestHash: variant.manifestHash,
      },
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'skill_key,exercise_kind,variant_key', ignoreDuplicates: true })
    if (result.error) throw result.error
    queued += 1
  }
  return queued
}

async function claimPractice(): Promise<PracticeQueueRow | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_active_practice_queue')
    .select('id,skill_key,variant_key,prompt,rubric,status,attempt_count,max_attempts,metadata,created_at')
    .eq('status', 'queued')
    .eq('generation_source', 'curated')
    .contains('metadata', { origin: ORIGIN })
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return null
  const claimed = await db.from('cos_active_practice_queue').update({
    status: 'running',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', result.data.id).eq('status', 'queued')
    .select('id,skill_key,variant_key,prompt,rubric,status,attempt_count,max_attempts,metadata,created_at')
    .maybeSingle()
  if (claimed.error) throw claimed.error
  return (claimed.data || null) as PracticeQueueRow | null
}

async function deferPractice(item: PracticeQueueRow, reason: string): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const result = await db.from('cos_active_practice_queue').update({
    status: 'queued',
    started_at: null,
    completed_at: null,
    last_error: clean(reason, 1200),
    next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', item.id).eq('status', 'running')
  if (result.error) throw result.error
}

async function practiceStateForPlan(planId: string, practiceRound: number): Promise<{
  total: number
  passed: number
  failed: number
  queued: number
  running: number
}> {
  const db = cosServiceDb()
  if (!db) return { total: 0, passed: 0, failed: 0, queued: 0, running: 0 }
  const result = await db.from('cos_active_practice_queue')
    .select('status')
    .eq('generation_source', 'curated')
    .contains('metadata', { origin: ORIGIN, universityPlanId: planId, practiceRound })
  if (result.error) throw result.error
  const statuses = (result.data || []).map(row => String(row.status || ''))
  return {
    total: statuses.length,
    passed: statuses.filter(status => status === 'passed').length,
    failed: statuses.filter(status => status === 'failed').length,
    queued: statuses.filter(status => status === 'queued').length,
    running: statuses.filter(status => status === 'running').length,
  }
}

async function reconcilePlan(planId: string, practiceRound: number): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) return false
  const current = await db.from('cos_university_study_plans').select('status,evidence').eq('id', planId).maybeSingle()
  if (current.error || !current.data) return false
  const state = await practiceStateForPlan(planId, practiceRound)
  const terminal = state.total >= COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND && state.queued === 0 && state.running === 0
  const ready = terminal && state.failed === 0 && state.passed >= COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND
  const evidence = asRecord(current.data.evidence)
  const update = await db.from('cos_university_study_plans').update({
    status: ready ? 'ready_for_exam' : 'studying',
    evidence: {
      ...evidence,
      deliberatePractice: {
        profile: COS_UNIVERSITY_PRACTICE_PROFILE,
        practiceRound,
        total: state.total,
        passed: state.passed,
        failed: state.failed,
        queued: state.queued,
        running: state.running,
        readyForIndependentExam: ready,
        academicCredit: false,
        updatedAt: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  }).eq('id', planId)
  if (update.error) throw update.error
  return ready
}

async function executePractice(item: PracticeQueueRow): Promise<CosUniversityPracticeRun> {
  const metadata = asRecord(item.metadata)
  const planId = clean(metadata.universityPlanId, 80) || null
  const planKey = clean(metadata.universityPlanKey, 160) || null
  const practiceRound = Number.isFinite(Number(metadata.practiceRound)) ? Math.max(1, Math.floor(Number(metadata.practiceRound))) : null
  const language = clean(metadata.languageCode, 10) as CosPlatformLanguage | ''
  const base = {
    queueId: item.id,
    planId,
    planKey,
    practiceRound,
    variantKey: item.variant_key,
  }

  beginEvidenceSourceUseTurn()
  let result: Awaited<ReturnType<typeof tryCOSFirstAnswer>>
  try {
    result = await tryCOSFirstAnswer({
      prompt: item.prompt,
      language: language || 'en',
      privileged: true,
      disableCache: true,
    })
  } catch (error) {
    flushCapturedEvidenceSourceUse()
    await deferPractice(item, `execution_error:${error instanceof Error ? error.message : String(error)}`)
    return { ...base, status: 'deferred', passed: null, score: null, coverage: null, turnId: null, reasons: ['execution_error'] }
  }

  const reply = result.handled ? result.reply : ('bestEffortReply' in result ? result.bestEffortReply ?? '' : '')
  const turnId = peekEvidenceSourceUseTurnId()
  const semanticCache = result.provenance.responseSource === 'semantic_cache' || result.provenance.responseSource === 'semantic_similarity'
  const freshLocal = Boolean(
    result.handled
    && result.provenance.localModelInvoked
    && !result.provenance.externalAiInvoked
    && !semanticCache
    && turnId,
  )
  flushCapturedEvidenceSourceUse()

  if (!freshLocal) {
    const reasons = [
      ...(result.handled ? [] : ['not_handled']),
      ...(result.provenance.localModelInvoked ? [] : ['local_reasoning_not_recorded']),
      ...(result.provenance.externalAiInvoked ? ['external_ai_used'] : []),
      ...(semanticCache ? ['semantic_cache_used'] : []),
      ...(turnId ? [] : ['turn_id_missing']),
    ]
    await deferPractice(item, reasons.join(';') || 'fresh_local_execution_required')
    return { ...base, status: 'deferred', passed: null, score: null, coverage: null, turnId: turnId || null, reasons }
  }

  const grade = evaluateAnswerAgainstRubric(reply, item.rubric || {
    requiredConceptGroups: [],
    forbiddenPatterns: [],
    minimumConceptCoverage: 1,
    minimumAnswerCharacters: 1000,
  })
  const db = cosServiceDb()
  if (!db) {
    await deferPractice(item, 'service_database_unavailable')
    return { ...base, status: 'deferred', passed: null, score: null, coverage: null, turnId: turnId || null, reasons: ['service_database_unavailable'] }
  }

  const rpc = await db.rpc('cos_record_cognitive_practice_result', {
    p_queue_id: item.id,
    p_success: grade.pass,
    p_score: grade.score,
    p_answer: reply,
    p_evidence: {
      ...grade,
      profile: COS_UNIVERSITY_PRACTICE_PROFILE,
      origin: ORIGIN,
      academicCredit: false,
      turnId,
      responseSource: result.provenance.responseSource,
      localModelInvoked: result.provenance.localModelInvoked,
      externalAiInvoked: result.provenance.externalAiInvoked,
    },
  })
  if (rpc.error) {
    await deferPractice(item, `practice_result_record_failed:${rpc.error.message}`)
    return { ...base, status: 'deferred', passed: null, score: null, coverage: null, turnId: turnId || null, reasons: ['practice_result_record_failed'] }
  }

  await refreshCognitiveSkillStatus(item.skill_key)
  if (planId && practiceRound) await reconcilePlan(planId, practiceRound)
  return {
    ...base,
    status: grade.pass ? 'passed' : 'failed',
    passed: grade.pass,
    score: grade.score,
    coverage: grade.coverage,
    turnId: turnId || null,
    reasons: grade.pass ? [] : [grade.reason],
  }
}

export async function runCosUniversityDeliberatePractice(options: {
  maxPlans?: number
  maxExercises?: number
} = {}): Promise<CosUniversityDeliberatePracticeSummary> {
  if (process.env.COS_UNIVERSITY_PRACTICE_ENABLED !== 'true') {
    return {
      enabled: false,
      recovered: 0,
      plansConsidered: 0,
      plansPrepared: 0,
      variantsQueued: 0,
      exercisesAttempted: 0,
      passed: 0,
      failed: 0,
      deferred: 0,
      readyForExam: 0,
      runs: [],
      errors: [],
      semantics: 'practice_is_measured_training_never_academic_credit',
    }
  }

  const summary: CosUniversityDeliberatePracticeSummary = {
    enabled: true,
    recovered: 0,
    plansConsidered: 0,
    plansPrepared: 0,
    variantsQueued: 0,
    exercisesAttempted: 0,
    passed: 0,
    failed: 0,
    deferred: 0,
    readyForExam: 0,
    runs: [],
    errors: [],
    semantics: 'practice_is_measured_training_never_academic_credit',
  }

  const maxPlans = positiveInt(options.maxPlans, DEFAULT_MAX_PLANS, 8)
  const maxExercises = positiveInt(options.maxExercises, DEFAULT_MAX_EXERCISES, 3)
  try {
    summary.recovered = await recoverStalePractice()
    const plans = await loadStudyPlans(maxPlans)
    summary.plansConsidered = plans.length
    for (const plan of plans) {
      try {
        summary.variantsQueued += await queuePracticeRound(plan)
        summary.plansPrepared += 1
      } catch (error) {
        summary.errors.push(`prepare:${plan.id}:${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (!summary.plansPrepared) return summary
    await ensureLocalInferenceRuntimeReady()
    for (let index = 0; index < maxExercises; index += 1) {
      const item = await claimPractice()
      if (!item) break
      const run = await executePractice(item)
      summary.runs.push(run)
      summary.exercisesAttempted += 1
      if (run.status === 'passed') summary.passed += 1
      else if (run.status === 'failed') summary.failed += 1
      else if (run.status === 'deferred') summary.deferred += 1
      if (run.planId && run.practiceRound) {
        const ready = await reconcilePlan(run.planId, run.practiceRound)
        if (ready) summary.readyForExam += 1
      }
    }
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error))
  }
  return summary
}
