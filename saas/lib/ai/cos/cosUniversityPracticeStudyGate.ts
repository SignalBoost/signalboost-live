import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { cosUniversityStudyProofEligible } from './cosUniversityStudyProof.ts'

const PRACTICE_PLAN_SCAN_LIMIT = 20

export type CosUniversityPracticePlanGateRow = {
  id: string
  plan_key: string
  priority: number
  status: string
  attempt_count: number
  last_attempt_at: string | null
  methods: unknown
  evidence: unknown
}

export type CosUniversityPracticeStudyGate = Readonly<{
  allowed: boolean
  reason: 'accepted_study_proof_verified' | 'restudy_required_after_failed_practice' | 'accepted_study_proof_required' | 'no_practice_plan' | 'service_database_unavailable'
  planId: string | null
  planKey: string | null
  studyAttempt: number | null
  semantics: 'practice_requires_current_host_accepted_study_proof'
}>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hasDeliberatePractice(methods: unknown): boolean {
  if (!Array.isArray(methods)) return false
  return methods.some(item => {
    const row = asRecord(item)
    return row.id === 'deliberate_practice' && row.execution === 'automatic_if_certifiable'
  })
}

function decision(
  allowed: boolean,
  reason: CosUniversityPracticeStudyGate['reason'],
  plan: CosUniversityPracticePlanGateRow | null,
): CosUniversityPracticeStudyGate {
  return {
    allowed,
    reason,
    planId: plan?.id || null,
    planKey: plan?.plan_key || null,
    studyAttempt: plan ? Math.max(1, Math.floor(Number(plan.attempt_count || 1))) : null,
    semantics: 'practice_requires_current_host_accepted_study_proof',
  }
}

export function evaluateCosUniversityPracticeStudyGate(
  plan: CosUniversityPracticePlanGateRow | null,
  now = new Date(),
): CosUniversityPracticeStudyGate {
  if (!plan) return decision(true, 'no_practice_plan', null)
  const studyAttempt = Math.max(1, Math.floor(Number(plan.attempt_count || 1)))
  const evidence = asRecord(plan.evidence)
  const remediation = asRecord(evidence.practiceRemediation)
  if (Number(remediation.practiceRound) === studyAttempt && remediation.requiresNewStudyAttempt === true) {
    return decision(false, 'restudy_required_after_failed_practice', plan)
  }
  if (!cosUniversityStudyProofEligible({
    attemptCount: studyAttempt,
    lastAttemptAt: plan.last_attempt_at,
    evidence,
    now,
  })) {
    return decision(false, 'accepted_study_proof_required', plan)
  }
  return decision(true, 'accepted_study_proof_verified', plan)
}

/**
 * Select the highest-ranked eligible deliberate-practice plan from the bounded scan.
 *
 * A higher-priority plan may legitimately be blocked while it awaits newer accepted study after a
 * failed practice round. That block applies to that plan only; it must not starve a later plan that
 * already has current host-accepted study proof. If no scanned practice plan is eligible, preserve
 * the first blocking decision for truthful observability rather than pretending there is no work.
 */
export function selectCosUniversityPracticeStudyGate(
  plans: readonly CosUniversityPracticePlanGateRow[],
  now = new Date(),
): CosUniversityPracticeStudyGate {
  let firstBlocked: CosUniversityPracticeStudyGate | null = null
  for (const plan of plans) {
    if (!hasDeliberatePractice(plan.methods)) continue
    const candidate = evaluateCosUniversityPracticeStudyGate(plan, now)
    if (candidate.allowed) return candidate
    if (!firstBlocked) firstBlocked = candidate
  }
  return firstBlocked ?? decision(true, 'no_practice_plan', null)
}

/** Match the normal one-plan deliberate-practice runner priority before any queue mutation/execution. */
export async function readCosUniversityPracticeStudyGate(now = new Date()): Promise<CosUniversityPracticeStudyGate> {
  const db = cosServiceDb()
  if (!db) return decision(false, 'service_database_unavailable', null)
  const result = await db.from('cos_university_study_plans')
    .select('id,plan_key,priority,status,attempt_count,last_attempt_at,methods,evidence')
    .eq('agent_id', 'cos')
    .eq('status', 'studying')
    .gt('attempt_count', 0)
    .order('priority', { ascending: false })
    .order('last_attempt_at', { ascending: false })
    .limit(PRACTICE_PLAN_SCAN_LIMIT)
  if (result.error) throw result.error
  return selectCosUniversityPracticeStudyGate(
    (result.data || []) as CosUniversityPracticePlanGateRow[],
    now,
  )
}
