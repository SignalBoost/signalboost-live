// saas/lib/outreach/prospectCampaignCoordinator.ts
//
// Enterprise coordinator for durable prospect-campaign execution.
//
// The core worker deliberately processes one campaign per invocation. This coordinator
// adds recovery semantics around it without weakening any drafting, approval, contact,
// dedupe, or send guardrail in the core implementation.
//
// CONCURRENCY: this module assumes overlapping invocations are possible and must be
// harmless. Vercel cron gives no delivery guarantee and no mutual exclusion; a schedule
// shorter than maxDuration produces genuine parallel workers. Every selection decision
// below is therefore written to be safe when N workers run it simultaneously.
import {
  advanceProspectCampaigns as advanceCore,
  listProspectCampaignJobs,
  type ProspectCampaignStatus,
} from './prospectCampaignCore'

const STALE_ZERO_DRAFT_MS = 10 * 60 * 1000

// Must exceed the route's maxDuration (300s). A worker inside its own execution window
// is BUSY, not stale. Judging liveness on a shorter horizon than a worker is allowed to
// run guarantees that healthy work is reclaimed mid-flight.
const WORKER_LEASE_MS = 6 * 60 * 1000

const SECOND_PASS_BUDGET_MS = 145_000

// Recovery attention is a scarce resource. A campaign that cannot produce a draft is a
// defect to surface, not a task to retry without limit: unbounded retries spend real
// money on an outcome that is not arriving. After this many recovery selections the job
// is left to ordinary fair scheduling and its failure becomes visible.
const MAX_RECOVERY_ATTEMPTS = 3

const recoveryAttempts = new Map<string, number>()

function lastActivityAt(job: Record<string, unknown>): number {
  // Prefer the most recent evidence of work. created_at is the birth of the job and
  // never advances, so it cannot distinguish "nobody has touched this in ten minutes"
  // from "five workers are touching it right now".
  for (const field of ['last_attempted_at', 'updated_at', 'started_at', 'created_at']) {
    const parsed = Date.parse(String(job[field] || ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return Number.NaN
}

export async function advanceProspectCampaignsEnterprise(jobId?: string): Promise<{
  ok: boolean
  jobId?: string
  status?: ProspectCampaignStatus
  units: number
  error?: string
}> {
  const started = Date.now()
  let targetJobId = jobId

  // Recovery priority: a campaign that has existed for ten minutes without producing a
  // single draft is operationally unhealthy. Do not let ordinary fair scheduling keep
  // rotating past it; explicitly give it the next worker turn until it either progresses
  // or records an honest terminal state/error.
  //
  // Two conditions bound that. A job touched inside WORKER_LEASE_MS is presumed to have
  // a live worker and is skipped — otherwise every concurrent invocation selects the
  // same job and drafts it in parallel. And a job that has already consumed
  // MAX_RECOVERY_ATTEMPTS turns stops being prioritised, so a permanently failing
  // campaign cannot capture every worker in the system.
  if (!targetJobId) {
    const listed = await listProspectCampaignJobs(50)
    if (listed.ok) {
      const now = Date.now()
      const stale = listed.jobs
        .filter(job => ['queued', 'discovering', 'running'].includes(job.status))
        .filter(job => Number(job.drafts_created || 0) === 0)
        .filter(job => {
          const created = Date.parse(String(job.created_at || ''))
          return Number.isFinite(created) && now - created >= STALE_ZERO_DRAFT_MS
        })
        .filter(job => {
          const touched = lastActivityAt(job as unknown as Record<string, unknown>)
          if (!Number.isFinite(touched)) return true
          return now - touched >= WORKER_LEASE_MS
        })
        .filter(job => (recoveryAttempts.get(String(job.id)) || 0) < MAX_RECOVERY_ATTEMPTS)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0]

      if (stale) {
        targetJobId = stale.id
        const attempts = (recoveryAttempts.get(String(stale.id)) || 0) + 1
        recoveryAttempts.set(String(stale.id), attempts)
        if (attempts >= MAX_RECOVERY_ATTEMPTS) {
          console.warn(
            `prospect-campaign recovery exhausted for job ${stale.id} after ${attempts} attempts ` +
              `with zero drafts created; returning it to ordinary scheduling. ` +
              `This campaign is failing to draft and needs inspection.`,
          )
        }
      }
    }
  }

  const first = await advanceCore(targetJobId)
  if (!first.ok || !first.jobId || first.status !== 'running') return first

  // Progress clears the recovery counter: a job that drafts is no longer the problem
  // this budget was reserved for.
  if (first.units > 0) recoveryAttempts.delete(String(first.jobId))

  // A quick first pass commonly means discovery completed and persisted candidates but
  // no drafting phase had enough wall-clock left to begin. When there is ample route
  // budget remaining, immediately give that SAME campaign a second pass instead of
  // making the operator wait for another cron invocation.
  //
  // A first pass that produced nothing is not "quick", it is unproductive; repeating it
  // in the same invocation repeats the same model calls for the same result.
  if (Date.now() - started < SECOND_PASS_BUDGET_MS && first.units > 0) {
    const second = await advanceCore(first.jobId)
    return {
      ...second,
      units: first.units + second.units,
      error: second.error || first.error,
    }
  }

  return first
}
