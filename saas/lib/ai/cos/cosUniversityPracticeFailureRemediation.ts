import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND } from './cosUniversityDeliberatePractice.ts'

type PracticeRun = {
  planId: string | null
  practiceRound: number | null
  status: 'passed' | 'failed' | 'deferred' | 'blocked'
}

type PlanRow = {
  id: string
  status: string
  attempt_count: number
  last_attempt_at: string | null
  evidence: unknown
}

type QueueStateRow = {
  status: string
  last_error: string | null
}

export type CosUniversityPracticeFailureRemediationSummary = {
  terminalFailedRounds: number
  plansReopenedForStudy: number
  failureReasons: string[]
  semantics: 'failed_practice_reopens_study_never_awards_academic_credit'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function roundKey(planId: string, practiceRound: number): string {
  return `${planId}:${practiceRound}`
}

export async function reopenCosUniversityStudyAfterFailedPractice(
  runs: readonly PracticeRun[],
  now = new Date(),
): Promise<CosUniversityPracticeFailureRemediationSummary> {
  const failedRounds = new Map<string, { planId: string; practiceRound: number }>()
  for (const run of runs) {
    const planId = String(run.planId || '').trim()
    const practiceRound = Number(run.practiceRound)
    if (run.status !== 'failed' || !planId || !Number.isFinite(practiceRound) || practiceRound < 1) continue
    const normalizedRound = Math.floor(practiceRound)
    failedRounds.set(roundKey(planId, normalizedRound), { planId, practiceRound: normalizedRound })
  }

  const summary: CosUniversityPracticeFailureRemediationSummary = {
    terminalFailedRounds: 0,
    plansReopenedForStudy: 0,
    failureReasons: [],
    semantics: 'failed_practice_reopens_study_never_awards_academic_credit',
  }
  if (!failedRounds.size) return summary

  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const allFailureReasons = new Set<string>()
  const nowIso = now.toISOString()

  for (const { planId, practiceRound } of failedRounds.values()) {
    const queueResult = await db.from('cos_active_practice_queue')
      .select('status,last_error')
      .eq('generation_source', 'curated')
      .contains('metadata', {
        origin: 'cos_university_deliberate_practice',
        universityPlanId: planId,
        practiceRound,
      })
    if (queueResult.error) throw queueResult.error
    const queue = (queueResult.data || []) as QueueStateRow[]
    const terminal = queue.length >= COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND
      && queue.every(row => row.status !== 'queued' && row.status !== 'running')
    const failed = queue.filter(row => row.status === 'failed')
    if (!terminal || !failed.length) continue
    summary.terminalFailedRounds += 1

    const reasons = [...new Set(failed.map(row => String(row.last_error || '').trim()).filter(Boolean))]
    reasons.forEach(reason => allFailureReasons.add(reason))

    const planResult = await db.from('cos_university_study_plans')
      .select('id,status,attempt_count,last_attempt_at,evidence')
      .eq('id', planId)
      .maybeSingle()
    if (planResult.error) throw planResult.error
    const plan = (planResult.data || null) as PlanRow | null
    if (!plan || plan.status !== 'studying' || Number(plan.attempt_count || 0) !== practiceRound) continue

    const evidence = asRecord(plan.evidence)
    const update = await db.from('cos_university_study_plans').update({
      status: 'studying',
      // A terminal failed practice round is new remediation evidence. Re-open the governed study
      // lane immediately instead of treating the previous study attempt as if no new failure occurred.
      last_attempt_at: null,
      evidence: {
        ...evidence,
        practiceRemediation: {
          practiceRound,
          failureReasons: reasons,
          requestedAt: nowIso,
          requiresNewStudyAttempt: true,
          requiresIndependentRetest: true,
          academicCredit: false,
        },
      },
      updated_at: nowIso,
    }).eq('id', planId).eq('status', 'studying').eq('attempt_count', practiceRound).select('id')
    if (update.error) throw update.error
    summary.plansReopenedForStudy += update.data?.length || 0
  }

  summary.failureReasons = [...allFailureReasons]
  return summary
}
