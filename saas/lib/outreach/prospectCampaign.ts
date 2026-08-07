// saas/lib/outreach/prospectCampaign.ts
//
// Direct compatibility surface for the proven durable prospect campaign worker.
//
// COS/Concierge already parses and admits a prospect campaign before it reaches this
// module. Keep this boundary as a pure re-export so queue creation, worker advancement,
// discovery, and pending-draft generation use the exact implementation in
// prospectCampaignCore.ts with no second runtime wrapper or intent decision.

export * from './prospectCampaignCore'
