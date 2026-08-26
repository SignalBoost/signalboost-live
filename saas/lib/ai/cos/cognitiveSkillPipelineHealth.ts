import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { certificationProfileForSkill } from '@/lib/ai/cos/cognitiveCertificationProfiles'

const HEALTH_TASK_ID = 'cos-cognitive-skill-pipeline-health'
const STRONG_STATUSES = new Set(['validated', 'learned', 'mastered'])

export type CognitiveSkillPipelineHealth = {
  schema: 'cos-cognitive-skill-pipeline-health-v1'
  totalSkills: number
  statusCounts: Record<string, number>
  strongSkills: number
  privateCertificationPending: number
  awaitingIndependentEvaluation: number
  queuedPracticeWithoutPromotionPath: number
  queuedPractice: number
  totalReuse: number
  lastUsedAt: string | null
  lastPromotionAt: string | null
  externalEvaluationEnabled: boolean
  certificationCandidate: string | null
  certificationFinalStatus: string | null
  certificationBlockedReason: string | null
  certificationModelCallsUsed: number
  recordedAt: string
}

function count(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
}

function text(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function latestIso(values: unknown[]): string | null {
  let latest: string | null = null
  let latestMs = -Infinity
  for (const value of values) {
    const normalized = text(value)
    if (!normalized) continue
    const parsed = Date.parse(normalized)
    if (!Number.isFinite(parsed) || parsed <= latestMs) continue
    latest = normalized
    latestMs = parsed
  }
  return latest
}

function strongStatus(status: unknown): boolean {
  return STRONG_STATUSES.has(String(status ?? ''))
}

function hasPromotionPath(skill: any, externalEvaluationEnabled: boolean): boolean {
  if (strongStatus(skill?.status)) return true
  if (Boolean(skill?.evaluator_approved)) return true
  if (externalEvaluationEnabled) return true
  return certificationProfileForSkill(skill) !== null
}

/**
 * Durable health for the procedural-learning pipeline. This deliberately records aggregate state,
 * never user prompts or hidden certification cases. It exists to make a stuck promotion path visible
 * instead of silently paying retrieval/practice cost while no skill can become live.
 */
export async function recordCognitiveSkillPipelineHealth(certification?: {
  candidate?: string | null
  finalStatus?: string | null
  blockedReason?: string | null
  modelCallsUsed?: number
} | null): Promise<CognitiveSkillPipelineHealth | null> {
  const db = cosServiceDb()
  if (!db) return null

  try {
    const [skillsResult, queueResult, promotionResult] = await Promise.all([
      db.from('cos_cognitive_skills')
        .select('skill_key,status,evaluator_approved,reuse_count,last_used_at,metadata,procedure'),
      db.from('cos_active_practice_queue')
        .select('skill_key,exercise_kind,status,generation_source')
        .eq('status', 'queued'),
      db.from('cos_learning_promotions')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (skillsResult.error) throw skillsResult.error
    if (queueResult.error) throw queueResult.error
    if (promotionResult.error) throw promotionResult.error

    const skills = skillsResult.data ?? []
    const queue = queueResult.data ?? []
    const externalEvaluationEnabled = process.env.COS_COGNITIVE_EXTERNAL_EVALUATION_ENABLED === 'true'
    const statusCounts: Record<string, number> = {}
    const byKey = new Map<string, any>()
    let strongSkills = 0
    let privateCertificationPending = 0
    let awaitingIndependentEvaluation = 0
    let totalReuse = 0

    for (const skill of skills) {
      const status = String((skill as any).status || 'unknown')
      statusCounts[status] = count(statusCounts[status]) + 1
      byKey.set(String((skill as any).skill_key), skill)
      totalReuse += count((skill as any).reuse_count)
      if (strongStatus(status)) {
        strongSkills += 1
        continue
      }
      const hasPrivateProfile = certificationProfileForSkill(skill) !== null
      if (hasPrivateProfile) privateCertificationPending += 1
      if (!Boolean((skill as any).evaluator_approved) && !hasPrivateProfile && !externalEvaluationEnabled) {
        awaitingIndependentEvaluation += 1
      }
    }

    const queuedPractice = queue.filter((item: any) => item.exercise_kind === 'practice')
    const queuedPracticeWithoutPromotionPath = queuedPractice.filter((item: any) => {
      const skill = byKey.get(String(item.skill_key))
      return Boolean(skill) && !hasPromotionPath(skill, externalEvaluationEnabled)
    }).length

    const health: CognitiveSkillPipelineHealth = {
      schema: 'cos-cognitive-skill-pipeline-health-v1',
      totalSkills: skills.length,
      statusCounts,
      strongSkills,
      privateCertificationPending,
      awaitingIndependentEvaluation,
      queuedPracticeWithoutPromotionPath,
      queuedPractice: queuedPractice.length,
      totalReuse,
      lastUsedAt: latestIso(skills.map((skill: any) => skill.last_used_at)),
      lastPromotionAt: text(promotionResult.data?.created_at),
      externalEvaluationEnabled,
      certificationCandidate: text(certification?.candidate),
      certificationFinalStatus: text(certification?.finalStatus),
      certificationBlockedReason: text(certification?.blockedReason),
      certificationModelCallsUsed: count(certification?.modelCallsUsed),
      recordedAt: new Date().toISOString(),
    }

    const routeBudgetBlocked = Boolean(health.certificationBlockedReason?.startsWith('route_budget_exhausted'))
    const succeeded = !routeBudgetBlocked && queuedPracticeWithoutPromotionPath === 0
    const insert = await db.from('cos_learning_observations').insert({
      task_id: HEALTH_TASK_ID,
      capability: 'cognitive-skills',
      strategy: JSON.stringify(health),
      succeeded,
      latency_ms: 0,
      external_cost_usd: 0,
      reusable: false,
    })
    if (insert.error) throw insert.error

    if (routeBudgetBlocked || queuedPracticeWithoutPromotionPath > 0) {
      console.warn('[cos-cognitive-skill-health] pipeline needs attention', {
        certificationBlockedReason: health.certificationBlockedReason,
        queuedPracticeWithoutPromotionPath,
        awaitingIndependentEvaluation,
      })
    }
    return health
  } catch (error) {
    console.warn('[cos-cognitive-skill-health] failed to record pipeline health', error instanceof Error ? error.message : String(error))
    return null
  }
}
