// saas/lib/cos/campaign-queue/campaign-traffic.ts
// Real, first-party click counts per campaign — logged directly by /api/track.

export interface CampaignTraffic {
  totalClicks: number
  byPlatform: Record<string, number>
  byCountry: Record<string, number>
  byRegion: Record<string, number>
  byCity: Record<string, number>
  lastClickAt: string | null
}

function inc(map: Record<string, number>, key: string | null | undefined) {
  const clean = String(key || 'unknown').trim() || 'unknown'
  map[clean] = (map[clean] || 0) + 1
}

export async function getCampaignTraffic(admin: any, campaignId: string): Promise<CampaignTraffic> {
  const { data, error } = await admin
    .from('cos_campaign_clicks')
    .select('platform, created_at, country, region, city')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })

  if (error || !data) return { totalClicks: 0, byPlatform: {}, byCountry: {}, byRegion: {}, byCity: {}, lastClickAt: null }

  const byPlatform: Record<string, number> = {}
  const byCountry: Record<string, number> = {}
  const byRegion: Record<string, number> = {}
  const byCity: Record<string, number> = {}

  for (const row of data) {
    inc(byPlatform, row.platform)
    inc(byCountry, row.country)
    inc(byRegion, row.region)
    inc(byCity, row.city)
  }

  return {
    totalClicks: data.length,
    byPlatform,
    byCountry,
    byRegion,
    byCity,
    lastClickAt: data[0]?.created_at || null,
  }
}

export function buildTrackingUrl(campaignId: string, platform: string): string {
  const site = 'https://www.saas.signalboostapp.com'
  return `${site}/api/track?c=${encodeURIComponent(campaignId)}&p=${encodeURIComponent(platform)}`
}
