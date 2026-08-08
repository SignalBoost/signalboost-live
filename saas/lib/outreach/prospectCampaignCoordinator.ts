// Enterprise coordinator for durable prospect-campaign execution.
//
// The core worker deliberately processes one campaign per invocation. This coordinator
// adds recovery semantics around it without weakening any drafting, approval, contact,
// dedupe, or send guardrail in the core implementation.

import {
  advanceProspectCampaigns as advanceCore,
  listProspectCampaignJobs,
  type ProspectCampaignStatus,
} from './prospectCampaignCore'

const STALE_ZERO_DRAFT_MS = 10 * 60 * 1000
const SECOND_PASS_BUDGET_MS = 145_000

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
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0]
      if (stale) targetJobId = stale.id
    }
  }

  const first = await advanceCore(targetJobId)
  if (!first.ok || !first.jobId || first.status !== 'running') return first

  // A quick first pass commonly means discovery completed and persisted candidates but
  // no drafting phase had enough wall-clock left to begin. When there is ample route
  // budget remaining, immediately give that SAME campaign a second pass instead of
  // making the operator wait for another cron invocation.
  if (Date.now() - started < SECOND_PASS_BUDGET_MS) {
    const second = await advanceCore(first.jobId)
    return {
      ...second,
      units: first.units + second.units,
      error: second.error || first.error,
    }
  }

  return first
}
