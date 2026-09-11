import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND } from './cosUniversityDeliberatePractice.ts'

const ORIGIN = 'cos_university_deliberate_practice'
const MAX_STUDY_PLANS_TO_RECONCILE = 100
const MAX_PRACTICE_ROWS_TO_RECONCILE = 2000

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
  priority: number
}

type QueueStateRow = {
  status: string
  last_error: string | null
  metadata: Record<string, unknown> | null
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

function runCandidateKeys(runs: readonly PracticeRun[]): Set<string> {
  const keys = new Set<string>()
  for (const run of runs) {
    const planId = String(run.planId || '').trim()
    const practiceRound = Number(run.practiceRound)
    if (run.status !== 'failed' || !planId || !Number.isFinite(practiceRound) || practiceRound < 1) continue
    keys.add(roundKey(planId, Math.floor(practiceRound)))
  }
  return keys
}

async function loadCurrentStudyingPlans(runPlanIds: string[], agentId: string): Promise<PlanRow[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_study_plans')
    .select('id,status,attempt_count,last_attempt_at,evidence,priority')
    .eq('agent_id', agentId)
    .eq('status', 'studying')
    .gt('attempt_count', 0)
    .order('priority', { ascending: false })
    .order('last_attempt_at', { ascending: true, nullsFirst: true })
    .limit(MAX_STUDY_PLANS_TO_RECONCILE)
  if (result.error) throw result.error
  const byId = new Map(((result.data || []) as PlanRow[]).map(plan => [plan.id, plan] as const))

  const missingRunPlanIds = [...new Set(runPlanIds)].filter(id => !byId.has(id))
  if (missingRunPlanIds.length) {
    const extra = await db.from('cos_university_study_plans')
      .select('id,status,attempt_count,last_attempt_at,evidence,priority')
      .eq('agent_id', agentId)
      .eq('status', 'studying')
      .in('id', missingRunPlanIds)
    if (extra.error) throw extra.error
    for (const plan of (extra.data || []) as PlanRow[]) byId.set(plan.id, plan)
  }
  return [...byId.values()]
}

async function loadUniversityPracticeRows(): Promise<QueueStateRow[]> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_active_practice_queue')
    .select('status,last_error,metadata')
    .eq('generation_source', 'curated')
    .contains('metadata', { origin: ORIGIN })
    .order('created_at', { ascending: false })
    .limit(MAX_PRACTICE_ROWS_TO_RECONCILE)
  if (result.error) throw result.error
  return (result.data || []) as QueueStateRow[]
}

function currentRoundRows(rows: QueueStateRow[], planId: string, practiceRound: number): QueueStateRow[] {
  return rows.filter(row => {
    const metadata = asRecord(row.metadata)
    return String(metadata.universityPlanId || '').trim() === planId
      && Number(metadata.practiceRound) === practiceRound
  })
}

/**
 * Close the practice → re-study feedback loop from durable queue state.
 *
 * Current terminal practice failure is durable evidence that the prior study attempt was insufficient,
 * so it should reopen the governed study lane without waiting out the ordinary study cooldown. This
 * reconciler scans current studying plans and persisted practice rows, so a deployment/restart or split
 * practice round across cron invocations cannot strand a legitimate failure. Current-call runs are only
 * hints for ensuring their plan IDs are included and for audit telemetry; they are not the source of truth.
 * Practice remains non-academic and cannot award a grade or satisfy an independent exam.
 */
export async function reopenCosUniversityStudyAfterFailedPractice(
  runs: readonly PracticeRun[] = [],
  now = new Date(),
  agentId = 'cos',
): Promise<CosUniversityPracticeFailureRemediationSummary> {
  const summary: CosUniversityPracticeFailureRemediationSummary = {
    terminalFailedRounds: 0,
    plansReopenedForStudy: 0,
    failureReasons: [],
    semantics: 'failed_practice_reopens_study_never_awards_academic_credit',
  }

  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const runKeys = runCandidateKeys(runs)
  const runPlanIds = [...runKeys].map(key => key.split(':', 1)[0]).filter(Boolean)
  const [plans, practiceRows] = await Promise.all([
    loadCurrentStudyingPlans(runPlanIds, agentId),
    loadUniversityPracticeRows(),
  ])
  if (!plans.length || !practiceRows.length) return summary

  const allFailureReasons = new Set<string>()
  const nowIso = now.toISOString()
  for (const plan of plans) {
    const practiceRound = Math.max(1, Math.floor(Number(plan.attempt_count || 1)))
    const rows = currentRoundRows(practiceRows, plan.id, practiceRound)
    const terminal = rows.length >= COS_UNIVERSITY_PRACTICE_VARIANTS_PER_ROUND
      && rows.every(row => row.status !== 'queued' && row.status !== 'running')
    const failed = rows.filter(row => row.status === 'failed')
    if (!terminal || !failed.length) continue
    summary.terminalFailedRounds += 1

    const reasons = [...new Set(failed.map(row => String(row.last_error || '').trim()).filter(Boolean))]
    reasons.forEach(reason => allFailureReasons.add(reason))
    const evidence = asRecord(plan.evidence)
    const priorRemediation = asRecord(evidence.practiceRemediation)
    const alreadyReopened = Number(priorRemediation.practiceRound) === practiceRound
      && priorRemediation.requiresNewStudyAttempt === true
      && priorRemediation.reconciledAfterTerminalFailure === true
      && plan.last_attempt_at === null
    if (alreadyReopened) continue

    const update = await db.from('cos_university_study_plans').update({
      status: 'studying',
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
          reconciledAfterTerminalFailure: true,
          reconciledAcrossRuntimeBoundary: !runKeys.has(roundKey(plan.id, practiceRound)),
        },
      },
      updated_at: nowIso,
    })
      .eq('id', plan.id)
      .eq('status', 'studying')
      .eq('attempt_count', practiceRound)
      .select('id')
    if (update.error) throw update.error
    summary.plansReopenedForStudy += update.data?.length || 0
  }

  summary.failureReasons = [...allFailureReasons]
  return summary
}
