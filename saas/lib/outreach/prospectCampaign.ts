// saas/lib/outreach/prospectCampaign.ts
//
// Compatibility surface for the durable prospect campaign worker.
//
// The worker in prospectCampaignCore.ts is the last-known-good implementation that ran
// the complete COS -> discovery -> draft-for-approval workflow. Keep this public module
// intentionally thin so existing callers (Concierge, cron, campaign jobs) invoke that
// worker directly without a second campaign-intent decision after COS has already parsed
// and admitted the request.
//
// Campaign routing still happens before this module at the Concierge/support boundary.
// This file only restores the worker contract that was in production before PR #928.

import * as core from './prospectCampaignCore'

export type {
  ProspectCampaignStatus,
  ProspectCandidate,
  ProspectResult,
  ProspectCampaignJob,
} from './prospectCampaignCore'

export {
  getProspectCampaignJob,
  listProspectCampaignJobs,
  cancelProspectCampaignJob,
  draftMessageFor,
  advanceProspectCampaigns,
  summarizeProspectCampaign,
} from './prospectCampaignCore'

type CoreInput = Parameters<typeof core.createProspectCampaignJob>[0]
export type CreateProspectCampaignInput = CoreInput & { brief?: string | null }

export async function createProspectCampaignJob(
  input: CreateProspectCampaignInput,
): ReturnType<typeof core.createProspectCampaignJob> {
  const { brief: _brief, ...coreInput } = input
  return core.createProspectCampaignJob(coreInput)
}
