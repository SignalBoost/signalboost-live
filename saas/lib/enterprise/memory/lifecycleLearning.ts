// Maps COS campaign lifecycle rows into bounded Enterprise Memory writes.
// Pure helpers keep route integration deterministic and easy to regression test.

export type CampaignLifecycleIdentity = {
  organizationId: string
  campaignId: string
  workspace: string
}

function clean(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

export function resolveCampaignLifecycleIdentity(campaign: any): CampaignLifecycleIdentity | null {
  const metadata = object(campaign?.metadata)
  const enterprise = object(metadata.enterprise)
  const organizationId = clean(
    campaign?.organization_id || metadata.organizationId || metadata.organization_id || enterprise.organizationId || enterprise.organization_id,
    120,
  )
  const campaignId = clean(campaign?.id || campaign?.campaign_id, 160)
  if (!organizationId || !campaignId) return null
  return {
    organizationId,
    campaignId,
    workspace: clean(campaign?.workspace || metadata.workspace || enterprise.workspace, 80) || 'cosa',
  }
}

export function buildApprovedLifecyclePayload(campaign: any) {
  const metadata = object(campaign?.metadata)
  return {
    objective: clean(campaign?.objective || campaign?.title, 1000),
    channel: clean(campaign?.channel, 120),
    humanEdits: {
      editRequests: Array.isArray(metadata.editRequests) ? metadata.editRequests.slice(-20) : [],
    },
    approvedVersion: {
      title: clean(campaign?.title, 500),
      objective: clean(campaign?.objective, 2000),
      workItems: Array.isArray(campaign?.work_items) ? campaign.work_items.slice(0, 50) : [],
      metadata,
    },
    executionStatus: 'approved',
  }
}

export function buildPublishedLifecyclePayload(campaign: any, published: Record<string, unknown>) {
  const approved = buildApprovedLifecyclePayload(campaign)
  return {
    ...approved,
    creative: clean((published as any)?.videoUrl || (published as any)?.result?.liveUrl, 4000),
    cta: clean((campaign?.metadata as any)?.cta || (campaign?.metadata as any)?.tracking_url, 1000),
    executionStatus: 'published',
    performanceData: { published },
  }
}

export function buildMeasuredLifecyclePayload(campaign: any, args: {
  performance: Record<string, unknown>
  traffic: Record<string, unknown>
  cost: unknown
  measuredAt: string
}) {
  const clicks = Number((args.traffic as any)?.clicks || (args.traffic as any)?.total || 0)
  const impressions = Object.values(args.performance || {}).reduce((sum, row: any) => sum + Math.max(0, Number(row?.viewCount) || 0), 0)
  return {
    objective: clean(campaign?.objective || campaign?.title, 1000),
    channel: clean(campaign?.channel, 120),
    executionStatus: 'measured',
    performanceData: {
      performance: args.performance,
      traffic: args.traffic,
      cost: args.cost,
      measuredAt: args.measuredAt,
      metrics: { impressions, clicks },
    },
  }
}
