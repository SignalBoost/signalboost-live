// saas/lib/cos/campaign-queue/campaign-traffic.ts
// Real, first-party click counts per campaign — logged directly by
// /api/track whenever someone clicks a campaign's tracking link. Guaranteed,
// verifiable data from our own database, not dependent on a third-party
// analytics dashboard.

export interface CampaignTraffic {
  totalClicks: number
  byPlatform: Record<string, number>
  lastClickAt: string | null
}

export async function getCampaignTraffic(admin: any, campaignId: string): Promise<CampaignTraffic> {
  const { data, error } = await admin
    .from('cos_campaign_clicks')
    .select('platform, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })

  if (error || !data) return { totalClicks: 0, byPlatform: {}, lastClickAt: null }

  const byPlatform: Record<string, number> = {}
  for (const row of data) {
    const key = row.platform || 'unknown'
    byPlatform[key] = (byPlatform[key] || 0) + 1
  }

  return {
    totalClicks: data.length,
    byPlatform,
    lastClickAt: data[0]?.created_at || null,
  }
}

export function buildTrackingUrl(campaignId: string, platform: string): string {
  const site = 'https://www.saas.signalboostapp.com'
  return `${site}/api/track?c=${encodeURIComponent(campaignId)}&p=${encodeURIComponent(platform)}`
}
