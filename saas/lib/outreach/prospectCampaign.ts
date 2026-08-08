// saas/lib/outreach/prospectCampaign.ts
//
// Public compatibility surface for prospect campaigns. Core owns the campaign data
// model and drafting rules; the coordinator adds stale-job recovery and an immediate
// second pass when discovery finishes with enough route budget remaining.

export * from './prospectCampaignCore'

export { advanceProspectCampaignsEnterprise as advanceProspectCampaigns } from './prospectCampaignCoordinator'
