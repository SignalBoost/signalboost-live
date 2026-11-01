// saas/lib/builder/campaign/job.ts
//
// ONE SLICE OF A VERIFICATION CAMPAIGN JOB. The job runner hands a claimed job here when its metadata says
// builderEngine 'campaign'. The campaign state (ledger + reliability progress) lives in the job's checkpoint, so a
// paused slice resumes exactly where it stopped through the ordinary continuation cron; the final History reply is
// the Section 13/14 evidence package. A campaign never touches a workspace or a repository.

import { PAC_CATALOG, PAC_CAMPAIGN_ID, isTargetedRun, selectCampaignChecks } from './catalog.ts'
import { renderCampaignReport, renderCampaignProgress, certifyCampaign } from './ledger.ts'
import { emptyCampaignLedger, runCampaignSlice, type CampaignState } from './runner.ts'
import type { CampaignPorts } from './ports.ts'

export const CAMPAIGN_ENGINE = 'campaign'
/**
 * A campaign's whole-job deadline. Twenty-eight real production requests (seven analysis checks, one routing check,
 * twenty reliability requests) at up to CAMPAIGN_REQUEST_TIMEOUT_MS each do not fit the Builder's 60-minute coding
 * deadline; the continuation budget (24 slices of 240 s) is the binding limit and this deadline sits just inside it.
 */
export const CAMPAIGN_TOTAL_DEADLINE_MS = 95 * 60_000

/**
 * The pause RPC (pause_builder_job_slice) persists a checkpoint only when it carries version '1' and the job's
 * workspaceId (Codex on #4973: without them the RPC returns false and the paused campaign could never resume).
 */
export type CampaignCheckpoint = Readonly<{ version: '1'; workspaceId: string; campaign: CampaignState }>

export function campaignStateFromCheckpoint(checkpoint: unknown, now = Date.now()): CampaignState {
  const stored = checkpoint && typeof checkpoint === 'object' ? (checkpoint as Record<string, unknown>).campaign : null
  if (stored && typeof stored === 'object') {
    const state = stored as CampaignState
    if (state.ledger && Array.isArray(state.ledger.rows)) {
      return {
        ledger: { ...state.ledger, revisionChanges: state.ledger.revisionChanges ?? [] }, reliability: state.reliability ?? null,
        shortestRequestMs: state.shortestRequestMs ?? 0, longestRequestMs: state.longestRequestMs ?? 0, interruptedItem: state.interruptedItem ?? null,
        browser: state.browser ?? null, fixture: state.fixture ?? null,
      }
    }
  }
  return { ledger: emptyCampaignLedger(PAC_CAMPAIGN_ID, now), reliability: null }
}

export type CampaignSliceOutcome =
  | Readonly<{ status: 'paused'; checkpoint: CampaignCheckpoint; reply: string; done: number; total: number }>
  | Readonly<{ status: 'succeeded' | 'failed'; reply: string; outcome: 'PASS' | 'FAIL' | 'BLOCKED'; result: Record<string, unknown> }>

/** Runs one slice. `remainingMs` is the slice's own clock; the campaign stops before an item it cannot finish. */
export async function runCampaignJobSlice(input: Readonly<{
  checkpoint: unknown
  workspaceId: string
  ports: CampaignPorts
  remainingMs: () => number
  signal?: AbortSignal
  /** The check ids this job runs (job metadata `campaignChecks`); absent or empty means the whole campaign. */
  checks?: readonly unknown[] | null
  /** Live status for the owner, written after every finished check while the slice runs. */
  progress?: (update: Readonly<{ reply: string; done: number; total: number }>) => Promise<void>
}>): Promise<CampaignSliceOutcome> {
  const catalog = selectCampaignChecks(input.checks)
  const scope = { targeted: isTargetedRun(catalog), campaignSize: PAC_CATALOG.length }
  const state = campaignStateFromCheckpoint(input.checkpoint)
  const reliabilityPrompts = PAC_CATALOG.filter(item => item.port === 'analysis' && item.prompt).map(item => item.prompt as string)
  const reliabilityRequired = (testId: string) => catalog.find(item => item.id === testId)?.count ?? 20
  const statusLine = (ledger: CampaignState['ledger'], reliability: CampaignState['reliability']) => renderCampaignProgress(
    ledger, catalog, scope, reliability ? { completed: reliability.completed, required: reliabilityRequired(reliability.testId) } : null,
  )
  const doneCount = (ledger: CampaignState['ledger']) => certifyCampaign(ledger, catalog).total - certifyCampaign(ledger, catalog).pending
  const slice = await runCampaignSlice({
    catalog, state, ports: input.ports, remainingMs: input.remainingMs, signal: input.signal, reliabilityPrompts,
    progress: input.progress
      ? snapshot => input.progress!({ reply: statusLine(snapshot.ledger, snapshot.reliability), done: doneCount(snapshot.ledger), total: catalog.length })
      : undefined,
  })
  const next: CampaignState = {
    ledger: slice.ledger, reliability: slice.reliability,
    shortestRequestMs: slice.shortestRequestMs, longestRequestMs: slice.longestRequestMs, interruptedItem: slice.interruptedItem,
    browser: slice.browser ?? null, fixture: slice.fixture ?? null,
  }
  if (slice.stopped !== 'complete') {
    return {
      status: 'paused',
      checkpoint: { version: '1', workspaceId: input.workspaceId, campaign: next },
      reply: statusLine(next.ledger, next.reliability),
      done: doneCount(next.ledger), total: catalog.length,
    }
  }
  const certification = certifyCampaign(next.ledger, catalog)
  const report = renderCampaignReport(next.ledger, catalog, scope)
  return {
    status: certification.outcome === 'PASS' ? 'succeeded' : 'failed',
    outcome: certification.outcome,
    reply: report,
    result: { campaignId: PAC_CAMPAIGN_ID, checks: catalog.map(item => item.id), targeted: scope.targeted, certification, ledger: next.ledger },
  }
}
