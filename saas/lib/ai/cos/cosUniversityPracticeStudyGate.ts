import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { selectCosUniversityPracticeGateDecision } from './cosUniversityPracticeSelectionPolicy.ts'
import { cosUniversityStudyProofEligible } from './cosUniversityStudyProof.ts'

const PRACTICE_PLAN_SCAN_LIMIT = 4

type PracticePlanRow = {
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
  plan: PracticePlanRow | null,
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
  plan: PracticePlanRow | null,
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
 * Match the normal one-plan deliberate-practice priority before any queue mutation/execution.
 * A blocked higher-ranked plan remains blocked for itself, but cannot starve a later plan in the
 * same bounded scan that already has current host-accepted study proof.
 */
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

  const decisions = ((result.data || []) as PracticePlanRow[])
    .filter(row => hasDeliberatePractice(row.methods))
    .map(plan => evaluateCosUniversityPracticeStudyGate(plan, now))

  return selectCosUniversityPracticeGateDecision(decisions)
    ?? decision(true, 'no_practice_plan', null)
}
