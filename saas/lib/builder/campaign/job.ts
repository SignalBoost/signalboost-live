// saas/lib/builder/campaign/job.ts
//
// ONE SLICE OF A VERIFICATION CAMPAIGN JOB. The job runner hands a claimed job here when its metadata says
// builderEngine 'campaign'. The campaign state (ledger + reliability progress) lives in the job's checkpoint, so a
// paused slice resumes exactly where it stopped through the ordinary continuation cron; the final History reply is
// the Section 13/14 evidence package. A campaign never touches a workspace or a repository.

import { PAC_CATALOG, PAC_CAMPAIGN_ID } from './catalog.ts'
import { renderCampaignReport, certifyCampaign } from './ledger.ts'
import { emptyCampaignLedger, runCampaignSlice, type CampaignState } from './runner.ts'
import type { CampaignPorts } from './ports.ts'

export const CAMPAIGN_ENGINE = 'campaign'

export type CampaignCheckpoint = Readonly<{ campaign: CampaignState }>

export function campaignStateFromCheckpoint(checkpoint: unknown, now = Date.now()): CampaignState {
  const stored = checkpoint && typeof checkpoint === 'object' ? (checkpoint as Record<string, unknown>).campaign : null
  if (stored && typeof stored === 'object') {
    const state = stored as CampaignState
    if (state.ledger && Array.isArray(state.ledger.rows)) return { ledger: state.ledger, reliability: state.reliability ?? null }
  }
  return { ledger: emptyCampaignLedger(PAC_CAMPAIGN_ID, now), reliability: null }
}

export type CampaignSliceOutcome =
  | Readonly<{ status: 'paused'; checkpoint: CampaignCheckpoint; reply: string; done: number; total: number }>
  | Readonly<{ status: 'succeeded' | 'failed'; reply: string; outcome: 'PASS' | 'FAIL' | 'BLOCKED'; result: Record<string, unknown> }>

/** Runs one slice. `remainingMs` is the slice's own clock; the campaign stops before an item it cannot finish. */
export async function runCampaignJobSlice(input: Readonly<{
  checkpoint: unknown
  ports: CampaignPorts
  remainingMs: () => number
  signal?: AbortSignal
}>): Promise<CampaignSliceOutcome> {
  const state = campaignStateFromCheckpoint(input.checkpoint)
  const reliabilityPrompts = PAC_CATALOG.filter(item => item.port === 'analysis' && item.prompt).map(item => item.prompt as string)
  const slice = await runCampaignSlice({ catalog: PAC_CATALOG, state, ports: input.ports, remainingMs: input.remainingMs, signal: input.signal, reliabilityPrompts })
  const next: CampaignState = { ledger: slice.ledger, reliability: slice.reliability }
  if (slice.stopped !== 'complete') {
    const done = next.ledger.rows.length
    const total = PAC_CATALOG.length
    const progressLine = next.reliability ? ` Reliability loop: ${next.reliability.completed} of 20 requests completed.` : ''
    return {
      status: 'paused',
      checkpoint: { campaign: next },
      reply: `Verification campaign ${PAC_CAMPAIGN_ID} in progress: ${done} of ${total} checks executed.${progressLine} It continues automatically; the evidence package will appear here when it finishes.`,
      done, total,
    }
  }
  const certification = certifyCampaign(next.ledger, PAC_CATALOG)
  const report = renderCampaignReport(next.ledger, PAC_CATALOG)
  return {
    status: certification.outcome === 'FAIL' ? 'failed' : 'succeeded',
    outcome: certification.outcome,
    reply: report,
    result: { campaignId: PAC_CAMPAIGN_ID, certification, ledger: next.ledger },
  }
}
