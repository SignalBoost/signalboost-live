import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { callCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { callProviderModel, type ModelProvider } from '@/lib/ai/providerRouter'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'
import {
  buildLocalPracticeGenerationPrompt,
  buildSkillExtractionPrompt,
  buildTeacherEvaluationPrompt,
  cognitiveSkillProcedure,
  evaluateAnswerAgainstRubric,
  parseCognitiveSkillDraft,
  parsePracticeVariants,
  parseTeacherEvaluation,
  skillKeyForDraft,
  validateCognitiveSkillDraft,
  type CognitivePracticeVariant,
  type CognitiveSkillDraft,
} from '@/lib/ai/cos/cognitiveSkillCandidate'
import {
  evaluateCognitiveSkillEligibility,
  type CognitiveSkillEvidence,
  type CognitiveSkillStatus,
} from '@/lib/ai/cos/cognitiveLearningLifecycle'

const STRONG_STATUSES = new Set<CognitiveSkillStatus>(['validated', 'learned', 'mastered'])

function clean(value: unknown, max = 6000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, max = 20): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback
}

function externalEvaluationEnabled(): boolean {
  return process.env.COS_COGNITIVE_EXTERNAL_EVALUATION_ENABLED === 'true'
}

function externalEvaluatorProvider(): Exclude<ModelProvider, 'local'> {
  const configured = process.env.COS_COGNITIVE_EVALUATOR_PROVIDER?.trim().toLowerCase()
  if (configured === 'openai' || configured === 'claude' || configured === 'gemini') return configured
  return 'gemini'
}

function skillEvidence(row: any): CognitiveSkillEvidence {
  return {
    evaluatorApproved: Boolean(row.evaluator_approved),
    understandingApproved: Boolean(row.understanding_approved),
    practiceAttempts: Number(row.practice_attempts || 0),
    practiceSuccesses: Number(row.practice_successes || 0),
    holdoutAttempts: Number(row.holdout_attempts || 0),
    holdoutSuccesses: Number(row.holdout_successes || 0),
    distinctHoldoutVariants: Number(row.distinct_holdout_variants || 0),
    productionAttempts: Number(row.production_attempts || 0),
    productionSuccesses: Number(row.production_successes || 0),
    failureCount: Number(row.failure_count || 0),
    lastValidatedAt: row.last_validated_at || null,
    quarantined: Boolean(row.quarantined_at),
  }
}

async function insertPromotion(db: NonNullable<ReturnType<typeof cosServiceDb>>, row: any, nextStatus: CognitiveSkillStatus, reasons: string[]): Promise<void> {
  if (String(row.status) === nextStatus) return
  await db.from('cos_learning_promotions').insert({
    skill_key: row.skill_key,
    from_status: row.status,
    to_status: nextStatus,
    evidence: {
      ...skillEvidence(row),
      eligibility: evaluateCognitiveSkillEligibility(skillEvidence(row)),
    },
    policy_version: 'cognitive-promotion-v1',
    reason: reasons.join(' '),
  })
}

export async function refreshCognitiveSkillStatus(skillKey: string): Promise<{ status: CognitiveSkillStatus; changed: boolean; eligibility: ReturnType<typeof evaluateCognitiveSkillEligibility> } | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_cognitive_skills').select('*').eq('skill_key', skillKey).maybeSingle()
  if (result.error || !result.data) return null
  const row = result.data as any
  const eligibility = evaluateCognitiveSkillEligibility(skillEvidence(row))
  const nextStatus = eligibility.recommendedStatus
  const changed = String(row.status) !== nextStatus
  if (changed) {
    await insertPromotion(db, row, nextStatus, eligibility.reasons)
    const update = await db.from('cos_cognitive_skills').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (update.error) throw update.error
  }

  if (STRONG_STATUSES.has(nextStatus)) {
    const teacherLessonId = Number(row.provenance?.teacher_lesson_id)
    if (Number.isFinite(teacherLessonId) && teacherLessonId > 0) {
      await db.from('cos_teacher_lessons').update({ status: 'promoted', updated_at: new Date().toISOString() }).eq('id', teacherLessonId)
    }
  }
  return { status: nextStatus, changed, eligibility }
}

async function enqueueVariant(args: {
  skillKey: string
  teacherLessonId: number
  kind: 'practice' | 'holdout'
  variant: CognitivePracticeVariant
  generationSource: 'local_generator' | 'frontier_teacher' | 'curated' | 'production_replay'
}): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) return false
  if (args.kind === 'holdout' && args.generationSource === 'local_generator') throw new Error('Local-generated variants cannot be holdouts.')
  const result = await db.from('cos_active_practice_queue').upsert({
    skill_key: args.skillKey,
    teacher_lesson_id: args.teacherLessonId,
    variant_key: clean(args.variant.variantKey, 160),
    exercise_kind: args.kind,
    prompt: clean(args.variant.prompt, 12000),
    rubric: args.variant.rubric,
    generation_source: args.generationSource,
    evaluator_mode: 'deterministic_rubric',
    max_attempts: args.kind === 'holdout' ? 1 : 2,
    status: 'queued',
    next_attempt_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'skill_key,exercise_kind,variant_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return true
}

async function linkedSkillForLesson(db: NonNullable<ReturnType<typeof cosServiceDb>>, lessonId: number): Promise<any | null> {
  const result = await db.from('cos_cognitive_skills').select('*').contains('provenance', { teacher_lesson_id: lessonId }).limit(1).maybeSingle()
  if (result.error) return null
  return result.data ?? null
}

async function persistDraft(db: NonNullable<ReturnType<typeof cosServiceDb>>, lesson: any, draft: CognitiveSkillDraft, reasonerLabel: string): Promise<any> {
  const skillKey = skillKeyForDraft(draft)
  const existing = await db.from('cos_cognitive_skills').select('*').eq('skill_key', skillKey).maybeSingle()
  if (existing.error) throw existing.error
  const now = new Date().toISOString()
  const provenance = {
    ...(existing.data?.provenance && typeof existing.data.provenance === 'object' ? existing.data.provenance : {}),
    origin: 'teacher_reflection',
    teacher_lesson_id: lesson.id,
    teacher_provider: lesson.teacher_provider || null,
    teacher_model: lesson.teacher_model || null,
    local_reflector: reasonerLabel,
  }
  const metadata = {
    ...(existing.data?.metadata && typeof existing.data.metadata === 'object' ? existing.data.metadata : {}),
    activation_rule: 'never inject until status is validated, learned, or mastered',
    confidence_rule: 'skill lifecycle status must not increase answer confidence',
    teacher_signal_semantics: 'experience_not_verified_truth',
  }

  if (existing.data?.id) {
    const existingStatus = String(existing.data.status) as CognitiveSkillStatus
    const patch: Record<string, unknown> = {
      encounter_count: Number(existing.data.encounter_count || 0) + 1,
      provenance,
      metadata,
      updated_at: now,
    }
    if (!STRONG_STATUSES.has(existingStatus) && existingStatus !== 'quarantined') {
      patch.title = draft.title
      patch.description = draft.description
      patch.procedure = cognitiveSkillProcedure(draft)
    }
    const updated = await db.from('cos_cognitive_skills').update(patch).eq('id', existing.data.id).select('*').single()
    if (updated.error) throw updated.error
    return updated.data
  }

  const inserted = await db.from('cos_cognitive_skills').insert({
    skill_key: skillKey,
    subject: clean(lesson.subject, 500) || draft.problemClass,
    title: draft.title,
    description: draft.description,
    procedure: cognitiveSkillProcedure(draft),
    status: 'encountered',
    evaluator_approved: false,
    understanding_approved: false,
    encounter_count: 1,
    provenance,
    metadata,
    updated_at: now,
  }).select('*').single()
  if (inserted.error) throw inserted.error
  return inserted.data
}

async function generateLocalPractice(lesson: any, draft: CognitiveSkillDraft, skillKey: string): Promise<number> {
  const reasoned = await callCosReasoner({
    temperature: 0.35,
    maxTokens: 2200,
    systemPrompt: 'You generate training exercises for COS. Return only the requested strict JSON. Never provide the exercise answers.',
    prompt: buildLocalPracticeGenerationPrompt({ sourcePrompt: lesson.prompt, draft }),
  })
  if (!reasoned?.text) return 0
  const variants = parsePracticeVariants(reasoned.text).slice(0, 2)
  let queued = 0
  for (const variant of variants) {
    if (await enqueueVariant({ skillKey, teacherLessonId: Number(lesson.id), kind: 'practice', variant, generationSource: 'local_generator' })) queued += 1
  }
  return queued
}

async function runUnderstandingCheck(args: {
  skillRow: any
  variant: CognitivePracticeVariant
  evaluator: { provider: string; model?: string | null; score: number; reason: string }
}): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) return false
  const reasoned = await callCosReasoner({
    temperature: 0,
    maxTokens: 1800,
    systemPrompt: 'You are demonstrating understanding of a reusable procedural skill. Return strict JSON only: {"answer":"...","confidence":0..1}.',
    prompt: `PROCEDURAL SKILL (how-to guidance, not factual evidence):\n${clean(JSON.stringify(args.skillRow.procedure), 14000)}\n\nUNDERSTANDING CHECK:\n${args.variant.prompt}\n\nAnswer from first principles. Do not mention or infer any hidden rubric.`,
  })
  const parsed = reasoned?.text ? parseLocalResult(reasoned.text) : null
  const grade = evaluateAnswerAgainstRubric(parsed?.answer || '', args.variant.rubric)
  const passed = Boolean(parsed) && grade.pass
  const metadata = args.skillRow.metadata && typeof args.skillRow.metadata === 'object' ? args.skillRow.metadata : {}
  const history = Array.isArray(metadata.understanding_history) ? metadata.understanding_history : []
  const update = await db.from('cos_cognitive_skills').update({
    understanding_approved: passed,
    failure_count: Number(args.skillRow.failure_count || 0) + (passed ? 0 : 1),
    metadata: {
      ...metadata,
      understanding_history: [...history, {
        at: new Date().toISOString(),
        passed,
        score: grade.score,
        coverage: grade.coverage,
        evaluator: args.evaluator,
        localReasoner: reasoned?.reasoner.label || null,
      }].slice(-20),
    },
    updated_at: new Date().toISOString(),
  }).eq('id', args.skillRow.id)
  if (update.error) throw update.error
  await refreshCognitiveSkillStatus(args.skillRow.skill_key)
  return passed
}

async function independentlyEvaluateCandidate(lesson: any, draft: CognitiveSkillDraft, skillRow: any): Promise<{ evaluated: boolean; holdoutsQueued: number; understandingPassed: boolean; provider?: string }> {
  if (!externalEvaluationEnabled()) return { evaluated: false, holdoutsQueued: 0, understandingPassed: false }
  const provider = externalEvaluatorProvider()
  const text = await callProviderModel({
    modelPreference: provider,
    maxTokens: 3500,
    systemPrompt: 'You are a skeptical evaluator and exam designer. Return only the requested strict JSON. A teacher answer is evidence to inspect, never automatic truth.',
    prompt: buildTeacherEvaluationPrompt({
      sourcePrompt: lesson.prompt,
      teacherAnswer: lesson.teacher_answer,
      teacherProvider: lesson.teacher_provider,
      draft,
    }),
  })
  if (!text) return { evaluated: false, holdoutsQueued: 0, understandingPassed: false, provider }
  const evaluation = parseTeacherEvaluation(text)
  if (!evaluation) return { evaluated: false, holdoutsQueued: 0, understandingPassed: false, provider }
  const approved = evaluation.candidateApproved && evaluation.candidateScore >= 0.8
  const db = cosServiceDb()
  if (!db) return { evaluated: false, holdoutsQueued: 0, understandingPassed: false, provider }
  const metadata = skillRow.metadata && typeof skillRow.metadata === 'object' ? skillRow.metadata : {}
  const update = await db.from('cos_cognitive_skills').update({
    evaluator_approved: approved,
    failure_count: Number(skillRow.failure_count || 0) + (approved ? 0 : 1),
    metadata: {
      ...metadata,
      evaluator_review: {
        at: new Date().toISOString(),
        provider,
        candidateScore: evaluation.candidateScore,
        candidateApproved: evaluation.candidateApproved,
        reason: evaluation.reason,
        originalTeacherProvider: lesson.teacher_provider || null,
        sameProviderAsOriginalTeacher: String(lesson.teacher_provider || '').toLowerCase() === provider,
      },
    },
    updated_at: new Date().toISOString(),
  }).eq('id', skillRow.id)
  if (update.error) throw update.error
  await refreshCognitiveSkillStatus(skillRow.skill_key)
  if (!approved) return { evaluated: true, holdoutsQueued: 0, understandingPassed: false, provider }

  let holdoutsQueued = 0
  for (const variant of evaluation.holdouts) {
    if (await enqueueVariant({
      skillKey: skillRow.skill_key,
      teacherLessonId: Number(lesson.id),
      kind: 'holdout',
      variant,
      generationSource: 'frontier_teacher',
    })) holdoutsQueued += 1
  }
  const refreshed = await db.from('cos_cognitive_skills').select('*').eq('id', skillRow.id).single()
  if (refreshed.error) throw refreshed.error
  const understandingPassed = await runUnderstandingCheck({
    skillRow: refreshed.data,
    variant: evaluation.understanding,
    evaluator: { provider, score: evaluation.candidateScore, reason: evaluation.reason },
  })
  return { evaluated: true, holdoutsQueued, understandingPassed, provider }
}

async function markLessonAttempt(db: NonNullable<ReturnType<typeof cosServiceDb>>, lesson: any, patch: Record<string, unknown>): Promise<void> {
  const metadata = lesson.metadata && typeof lesson.metadata === 'object' ? lesson.metadata : {}
  const attempts = Number(metadata.cognitive_evaluation_attempts || 0) + 1
  const result = await db.from('cos_teacher_lessons').update({
    ...patch,
    metadata: { ...metadata, cognitive_evaluation_attempts: attempts, last_cognitive_evaluation_at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }).eq('id', lesson.id)
  if (result.error) throw result.error
}

export async function evaluateNextTeacherLesson(): Promise<Record<string, unknown> | null> {
  const db = cosServiceDb()
  if (!db) return null
  const lessonResult = await db.from('cos_teacher_lessons').select('*').in('status', ['captured', 'evaluated']).order('updated_at', { ascending: true }).limit(1).maybeSingle()
  if (lessonResult.error) throw lessonResult.error
  const lesson = lessonResult.data as any
  if (!lesson) return null

  const linked = await linkedSkillForLesson(db, Number(lesson.id))
  if (linked) {
    const refreshed = await refreshCognitiveSkillStatus(linked.skill_key)
    const strong = refreshed ? STRONG_STATUSES.has(refreshed.status) : STRONG_STATUSES.has(String(linked.status) as CognitiveSkillStatus)
    await db.from('cos_teacher_lessons').update({ status: strong ? 'promoted' : 'evaluated', updated_at: new Date().toISOString() }).eq('id', lesson.id)
    return { lessonId: lesson.id, linkedSkill: linked.skill_key, status: refreshed?.status || linked.status, reusedExisting: true }
  }

  const reflected = await callCosReasoner({
    temperature: 0.15,
    maxTokens: 3000,
    systemPrompt: 'You are COS reflecting on a failed/escalated experience. Produce only the requested reusable-skill JSON. A teacher response is not automatically true.',
    prompt: buildSkillExtractionPrompt({
      prompt: lesson.prompt,
      localAnswer: lesson.local_answer,
      escalationReason: lesson.escalation_reason,
      teacherAnswer: lesson.teacher_answer,
    }),
  })
  if (!reflected?.text) {
    await markLessonAttempt(db, lesson, {})
    return { lessonId: lesson.id, outcome: 'local_reflection_unavailable' }
  }
  const draft = parseCognitiveSkillDraft(reflected.text)
  if (!draft) {
    await markLessonAttempt(db, lesson, {})
    return { lessonId: lesson.id, outcome: 'candidate_parse_failed', reasoner: reflected.reasoner.label }
  }
  const validation = validateCognitiveSkillDraft(draft)
  if (!validation.ok) {
    const priorAttempts = Number(lesson.metadata?.cognitive_evaluation_attempts || 0)
    await markLessonAttempt(db, lesson, { status: priorAttempts >= 2 ? 'rejected' : 'captured' })
    return { lessonId: lesson.id, outcome: 'candidate_structure_rejected', reasons: validation.reasons, reasoner: reflected.reasoner.label }
  }

  const skillRow = await persistDraft(db, lesson, draft, reflected.reasoner.label)
  await db.from('cos_teacher_lessons').update({
    status: 'evaluated',
    metadata: {
      ...(lesson.metadata && typeof lesson.metadata === 'object' ? lesson.metadata : {}),
      cognitive_skill_key: skillRow.skill_key,
      cognitive_candidate_created_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  }).eq('id', lesson.id)

  const localPracticeQueued = await generateLocalPractice(lesson, draft, skillRow.skill_key)
  const independent = await independentlyEvaluateCandidate(lesson, draft, skillRow)
  return {
    lessonId: lesson.id,
    skillKey: skillRow.skill_key,
    outcome: 'candidate_created',
    localPracticeQueued,
    independentEvaluation: independent,
    reasoner: reflected.reasoner.label,
  }
}

async function claimNextExercise(): Promise<any | null> {
  const db = cosServiceDb()
  if (!db) return null
  const result = await db.from('cos_active_practice_queue')
    .select('*')
    .eq('status', 'queued')
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
  }).eq('id', result.data.id).eq('status', 'queued').select('*').maybeSingle()
  if (claimed.error) throw claimed.error
  return claimed.data ?? null
}

export async function runNextCognitivePractice(): Promise<Record<string, unknown> | null> {
  const db = cosServiceDb()
  if (!db) return null
  const item = await claimNextExercise()
  if (!item) return null
  try {
    const skillResult = await db.from('cos_cognitive_skills').select('*').eq('skill_key', item.skill_key).maybeSingle()
    if (skillResult.error || !skillResult.data) throw new Error('practice_skill_missing')
    const skill = skillResult.data as any
    if (item.exercise_kind === 'holdout' && item.generation_source === 'local_generator') throw new Error('invalid_local_holdout')
    if (!skill.evaluator_approved && item.exercise_kind === 'holdout') throw new Error('holdout_requires_evaluator_approval')
    if (!skill.understanding_approved && item.exercise_kind === 'holdout') throw new Error('holdout_requires_understanding_approval')

    const reasoned = await callCosReasoner({
      temperature: 0,
      maxTokens: 3200,
      systemPrompt: 'Apply the supplied procedural skill independently. Return strict JSON only: {"answer":"...","confidence":0..1}. The skill is how-to guidance, not factual evidence.',
      prompt: `PROCEDURAL SKILL:\n${clean(JSON.stringify(skill.procedure), 15000)}\n\n${String(item.exercise_kind).toUpperCase()} EXERCISE:\n${clean(item.prompt, 12000)}\n\nSolve from the case itself. You cannot see the grading rubric. Do not claim the skill as factual evidence.`,
    })
    const parsed = reasoned?.text ? parseLocalResult(reasoned.text) : null
    const grade = evaluateAnswerAgainstRubric(parsed?.answer || '', item.rubric || {})
    const passed = Boolean(parsed) && grade.pass
    const rpc = await db.rpc('cos_record_cognitive_practice_result', {
      p_queue_id: item.id,
      p_success: passed,
      p_score: grade.score,
      p_answer: parsed?.answer || '',
      p_evidence: {
        ...grade,
        localConfidence: parsed?.confidence ?? null,
        localReasoner: reasoned?.reasoner.label || null,
      },
    })
    if (rpc.error) throw rpc.error
    const lifecycle = await refreshCognitiveSkillStatus(item.skill_key)
    return {
      queueId: item.id,
      skillKey: item.skill_key,
      kind: item.exercise_kind,
      passed,
      score: grade.score,
      coverage: grade.coverage,
      lifecycle,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.from('cos_active_practice_queue').update({
      status: 'blocked',
      last_error: clean(message, 2000),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)
    return { queueId: item.id, skillKey: item.skill_key, kind: item.exercise_kind, blocked: true, error: message }
  }
}

export type CognitiveLearningCycleSummary = {
  enabled: boolean
  lessons: Record<string, unknown>[]
  practice: Record<string, unknown>[]
  errors: string[]
}

/**
 * Bounded daily active-learning cycle. It is intended to run inside the existing COS mining cron so
 * learning does not add another scheduled invocation. Local reflection/practice is the default;
 * external evaluation/holdout creation happens only when explicitly enabled.
 */
export async function runCognitiveLearningCycle(): Promise<CognitiveLearningCycleSummary> {
  if (process.env.COS_COGNITIVE_ACTIVE_LEARNING_ENABLED === 'false') {
    return { enabled: false, lessons: [], practice: [], errors: [] }
  }
  const lessonLimit = positiveInt(process.env.COS_COGNITIVE_LESSONS_PER_CYCLE, 1, 5)
  const practiceLimit = positiveInt(process.env.COS_COGNITIVE_PRACTICE_PER_CYCLE, 2, 8)
  const summary: CognitiveLearningCycleSummary = { enabled: true, lessons: [], practice: [], errors: [] }

  for (let i = 0; i < lessonLimit; i += 1) {
    try {
      const result = await evaluateNextTeacherLesson()
      if (!result) break
      summary.lessons.push(result)
    } catch (error) {
      summary.errors.push(`lesson:${error instanceof Error ? error.message : String(error)}`)
      break
    }
  }
  for (let i = 0; i < practiceLimit; i += 1) {
    try {
      const result = await runNextCognitivePractice()
      if (!result) break
      summary.practice.push(result)
    } catch (error) {
      summary.errors.push(`practice:${error instanceof Error ? error.message : String(error)}`)
      break
    }
  }
  return summary
}
