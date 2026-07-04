// saas/lib/cos/campaign-queue/campaign-traffic.ts
// Real, first-party click counts per campaign — logged directly by /api/track.

export interface CampaignTraffic {
  totalClicks: number
  byPlatform: Record<string, number>
  byLanguage: Record<string, number>
  byTargetRegion: Record<string, number>
  byCountry: Record<string, number>
  byRegion: Record<string, number>
  byCity: Record<string, number>
  lastClickAt: string | null
}

const LANGUAGE_REGION: Record<string, string> = {
  en: 'us',
  es: 'latam',
  pt: 'brazil',
  pl: 'poland',
  ru: 'global_ru',
}

function inc(map: Record<string, number>, key: string | null | undefined) {
  const clean = String(key || 'unknown').trim() || 'unknown'
  map[clean] = (map[clean] || 0) + 1
}

export function targetRegionForLanguage(language?: string | null): string | null {
  const lang = String(language || '').trim().toLowerCase()
  return LANGUAGE_REGION[lang] || null
}

export async function getCampaignTraffic(admin: any, campaignId: string): Promise<CampaignTraffic> {
  const { data, error } = await admin
    .from('cos_campaign_clicks')
    .select('platform, language, target_region, created_at, country, region, city')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })

  if (error || !data) return { totalClicks: 0, byPlatform: {}, byLanguage: {}, byTargetRegion: {}, byCountry: {}, byRegion: {}, byCity: {}, lastClickAt: null }

  const byPlatform: Record<string, number> = {}
  const byLanguage: Record<string, number> = {}
  const byTargetRegion: Record<string, number> = {}
  const byCountry: Record<string, number> = {}
  const byRegion: Record<string, number> = {}
  const byCity: Record<string, number> = {}

  for (const row of data) {
    inc(byPlatform, row.platform)
    inc(byLanguage, row.language)
    inc(byTargetRegion, row.target_region)
    inc(byCountry, row.country)
    inc(byRegion, row.region)
    inc(byCity, row.city)
  }

  return {
    totalClicks: data.length,
    byPlatform,
    byLanguage,
    byTargetRegion,
    byCountry,
    byRegion,
    byCity,
    lastClickAt: data[0]?.created_at || null,
  }
}

export function buildTrackingUrl(campaignId: string, platform: string, language?: string | null, targetRegion?: string | null): string {
  const site = 'https://www.saas.signalboostapp.com'
  const params = new URLSearchParams({ c: campaignId, p: platform })
  const lang = String(language || '').trim().toLowerCase()
  const region = String(targetRegion || targetRegionForLanguage(lang) || '').trim().toLowerCase()
  if (lang) params.set('lang', lang)
  if (region) params.set('region', region)
  return `${site}/api/track?${params.toString()}`
}
