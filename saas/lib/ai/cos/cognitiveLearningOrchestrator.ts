import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  evaluateNextTeacherLesson,
  runNextCognitivePractice,
} from '@/lib/ai/cos/cognitiveActiveLearning'
import {
  certificationProfileForSkill,
  type CognitiveCertificationProfileKey,
} from '@/lib/ai/cos/cognitiveCertificationProfiles'

const STRONG_STATUSES = new Set(['validated', 'learned', 'mastered'])

type PromotionPath =
  | { kind: 'strong' }
  | { kind: 'private_certification'; profile: CognitiveCertificationProfileKey }
  | { kind: 'approved_evaluator' }
  | { kind: 'external_evaluator' }
  | { kind: 'none' }

export type CognitivePracticeCleanup = {
  inspected: number
  discarded: number
  kept: number
  details: Array<{ skillKey: string; reason: string }>
}

export type GovernedCognitiveLearningCycleSummary = {
  enabled: boolean
  lessons: Record<string, unknown>[]
  practice: Record<string, unknown>[]
  cleanup: CognitivePracticeCleanup
  practiceSkippedReason: string | null
  errors: string[]
}

function positiveInt(value: unknown, fallback: number, max = 20): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback
}

function externalEvaluationEnabled(): boolean {
  return process.env.COS_COGNITIVE_EXTERNAL_EVALUATION_ENABLED === 'true'
}

function clean(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function cognitivePromotionPathForSkill(
  skill: any,
  externalEnabled = externalEvaluationEnabled(),
): PromotionPath {
  if (STRONG_STATUSES.has(String(skill?.status || ''))) return { kind: 'strong' }
  const profile = certificationProfileForSkill(skill)
  if (profile) return { kind: 'private_certification', profile }
  if (Boolean(skill?.evaluator_approved)) return { kind: 'approved_evaluator' }
  if (externalEnabled) return { kind: 'external_evaluator' }
  return { kind: 'none' }
}

async function updatePromotionPathMetadata(skill: any, path: PromotionPath, reason: string): Promise<void> {
  const db = cosServiceDb()
  if (!db || !skill?.id) return
  const metadata = skill.metadata && typeof skill.metadata === 'object' ? skill.metadata : {}
  const now = new Date().toISOString()
  const state = path.kind === 'private_certification'
    ? 'private_certification'
    : path.kind === 'none'
      ? 'awaiting_independent_evaluation'
      : path.kind
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    promotion_path: {
      state,
      reason,
      at: now,
      ...(path.kind === 'private_certification' ? { profile: path.profile } : {}),
    },
  }
  if (path.kind === 'private_certification') nextMetadata.certification_profile = path.profile
  const result = await db.from('cos_cognitive_skills').update({ metadata: nextMetadata, updated_at: now }).eq('id', skill.id)
  if (result.error) throw result.error
}

/**
 * Remove self-generated practice that either cannot contribute to an independent promotion path or
 * is redundant with a private curated certification suite. This never discards frontier-teacher,
 * curated, or production-replay evidence and never changes lifecycle evidence counters.
 */
export async function discardUnnecessaryLocalCognitivePractice(limit = 32): Promise<CognitivePracticeCleanup> {
  const empty: CognitivePracticeCleanup = { inspected: 0, discarded: 0, kept: 0, details: [] }
  const db = cosServiceDb()
  if (!db) return empty

  const queued = await db.from('cos_active_practice_queue')
    .select('id,skill_key,exercise_kind,generation_source,status')
    .eq('status', 'queued')
    .eq('exercise_kind', 'practice')
    .eq('generation_source', 'local_generator')
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(100, Math.floor(limit))))
  if (queued.error) throw queued.error
  const rows = queued.data ?? []
  if (!rows.length) return empty

  const skillKeys = [...new Set(rows.map((row: any) => clean(row.skill_key, 240)).filter(Boolean))]
  const skills = await db.from('cos_cognitive_skills')
    .select('id,skill_key,status,evaluator_approved,metadata,procedure')
    .in('skill_key', skillKeys)
  if (skills.error) throw skills.error
  const byKey = new Map((skills.data ?? []).map((skill: any) => [String(skill.skill_key), skill]))
  const externalEnabled = externalEvaluationEnabled()
  const metadataUpdated = new Set<string>()
  const summary: CognitivePracticeCleanup = { inspected: rows.length, discarded: 0, kept: 0, details: [] }

  for (const row of rows as any[]) {
    const skillKey = clean(row.skill_key, 240)
    const skill = byKey.get(skillKey)
    const path = skill ? cognitivePromotionPathForSkill(skill, externalEnabled) : { kind: 'none' } as PromotionPath
    let discardReason: string | null = null

    if (!skill) discardReason = 'practice_skill_missing'
    else if (path.kind === 'strong') discardReason = 'skill_already_strong'
    else if (path.kind === 'private_certification') discardReason = 'private_certification_uses_curated_practice'
    else if (path.kind === 'none') discardReason = 'no_independent_promotion_path'

    if (!discardReason) {
      summary.kept += 1
      continue
    }

    const now = new Date().toISOString()
    const discarded = await db.from('cos_active_practice_queue').update({
      status: 'discarded',
      last_error: discardReason,
      completed_at: now,
      updated_at: now,
    }).eq('id', row.id).eq('status', 'queued')
    if (discarded.error) throw discarded.error
    summary.discarded += 1
    summary.details.push({ skillKey, reason: discardReason })

    if (skill && !metadataUpdated.has(skillKey) && (path.kind === 'private_certification' || path.kind === 'none')) {
      await updatePromotionPathMetadata(skill, path, discardReason)
      metadataUpdated.add(skillKey)
    }
  }

  return summary
}

async function hasQueuedPrivateCertificationWork(): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) return false
  const result = await db.from('cos_active_practice_queue')
    .select('id')
    .eq('status', 'queued')
    .eq('generation_source', 'curated')
    .contains('metadata', { origin: 'autonomous_cognitive_certification' })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data?.id)
}

function mergeCleanup(target: CognitivePracticeCleanup, next: CognitivePracticeCleanup): void {
  target.inspected += next.inspected
  target.discarded += next.discarded
  target.kept += next.kept
  target.details.push(...next.details)
  if (target.details.length > 40) target.details.splice(0, target.details.length - 40)
}

/**
 * Production cognitive-learning orchestration. Candidate reflection remains available, but the
 * active-learning practice loop is allowed to consume reasoner calls only when an independent
 * evaluator path exists. Private certification owns its curated queue exclusively so the one-call
 * certification budget cannot be bypassed by the generic practice worker.
 */
export async function runGovernedCognitiveLearningCycle(): Promise<GovernedCognitiveLearningCycleSummary> {
  if (process.env.COS_COGNITIVE_ACTIVE_LEARNING_ENABLED === 'false') {
    return {
      enabled: false,
      lessons: [],
      practice: [],
      cleanup: { inspected: 0, discarded: 0, kept: 0, details: [] },
      practiceSkippedReason: 'disabled',
      errors: [],
    }
  }

  const lessonLimit = positiveInt(process.env.COS_COGNITIVE_LESSONS_PER_CYCLE, 1, 5)
  const practiceLimit = positiveInt(process.env.COS_COGNITIVE_PRACTICE_PER_CYCLE, 2, 8)
  const summary: GovernedCognitiveLearningCycleSummary = {
    enabled: true,
    lessons: [],
    practice: [],
    cleanup: { inspected: 0, discarded: 0, kept: 0, details: [] },
    practiceSkippedReason: null,
    errors: [],
  }

  try {
    mergeCleanup(summary.cleanup, await discardUnnecessaryLocalCognitivePractice())
  } catch (error) {
    summary.errors.push(`cleanup:${error instanceof Error ? error.message : String(error)}`)
  }

  for (let i = 0; i < lessonLimit; i += 1) {
    try {
      const result = await evaluateNextTeacherLesson()
      if (!result) break
      summary.lessons.push(result)
      // evaluateNextTeacherLesson may have produced local practice. Remove it before any practice
      // worker can spend another reasoner call on a candidate that lacks independent promotion.
      mergeCleanup(summary.cleanup, await discardUnnecessaryLocalCognitivePractice())
    } catch (error) {
      summary.errors.push(`lesson:${error instanceof Error ? error.message : String(error)}`)
      break
    }
  }

  const externalEnabled = externalEvaluationEnabled()
  let privateCertificationQueued = false
  try {
    privateCertificationQueued = await hasQueuedPrivateCertificationWork()
  } catch (error) {
    summary.errors.push(`certification-queue:${error instanceof Error ? error.message : String(error)}`)
  }

  if (privateCertificationQueued) {
    summary.practiceSkippedReason = 'private_certification_queue_owned_by_certification_cycle'
    return summary
  }
  if (!externalEnabled) {
    summary.practiceSkippedReason = 'no_external_evaluator_and_private_practice_is_certification_owned'
    return summary
  }

  for (let i = 0; i < practiceLimit; i += 1) {
    try {
      mergeCleanup(summary.cleanup, await discardUnnecessaryLocalCognitivePractice())
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
