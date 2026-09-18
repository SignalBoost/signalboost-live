// saas/lib/ai/cos/cosUniversityDistillationCampaignClosure.ts
// Owner direction (2026-09-17, item 10): campaigns whose runs stopped must end in a recorded terminal state instead
// of lingering as authorized/active past their own expiry. Nothing closes them today: completeCampaignIfDone only
// marks a campaign completed when every run reached 'complete'. This decides closures from campaign and run state
// alone. It never retries, re-authorizes, refunds, promotes or touches a campaign that is still inside its window.
export const DISTILLATION_CAMPAIGN_CLOSURE_PROFILE = 'cos-university-distillation-campaign-closure-v1' as const

export type CampaignClosureStatus = 'completed' | 'expired' | 'failed'
export type ClosureCampaign = Readonly<{ id: string; status: string; expiresAt: string; authorizedAt: string }>
export type ClosureRun = Readonly<{ campaignId: string; stage: string }>
export type CampaignClosure = Readonly<{
  campaignId: string
  status: CampaignClosureStatus
  reason: string
  runs: number
  completeRuns: number
}>

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'expired'])
const at = (value: string | null | undefined) => Date.parse(String(value || ''))

export function decideDistillationCampaignClosures(input: {
  campaigns: readonly ClosureCampaign[]
  runs: readonly ClosureRun[]
  now: Date
  maxClosures?: number
}): readonly CampaignClosure[] {
  const nowMs = input.now.getTime()
  const limit = Math.max(1, Math.min(Math.floor(input.maxClosures ?? 10), 50))
  const closures: CampaignClosure[] = []

  for (const campaign of [...input.campaigns].sort((a, b) => at(a.authorizedAt) - at(b.authorizedAt))) {
    if (closures.length >= limit) break
    if (!campaign.id || TERMINAL.has(String(campaign.status))) continue
    const expiresMs = at(campaign.expiresAt)
    // A campaign inside its own window is live work, never closed here.
    if (!Number.isFinite(expiresMs) || expiresMs > nowMs) continue

    const runs = input.runs.filter(run => run.campaignId === campaign.id)
    const completeRuns = runs.filter(run => run.stage === 'complete').length
    const status: CampaignClosureStatus = runs.length > 0 && completeRuns === runs.length
      ? 'completed'
      : completeRuns > 0 ? 'expired' : 'failed'
    const reason = status === 'completed'
      ? 'all_runs_complete_at_expiry'
      : status === 'expired' ? 'expired_with_partial_runs' : 'expired_without_a_complete_run'
    closures.push(Object.freeze({ campaignId: campaign.id, status, reason, runs: runs.length, completeRuns }))
  }
  return Object.freeze(closures)
}
