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

export * from './prospectCampaignCore'
