// saas/marketing-sales-core/console.ts
// Executive console aggregate, portable and host-injected: every campaign for an
// org with its current status, language count, and — when published — the real
// live URL and channel. One read surface for the whole pipeline ("one monitor,
// one job"). Read-only: it reports state, it never changes it.
import type { MarketingHost, Campaign, Result } from './types'

export interface ConsoleRow {
  campaign: Campaign
  draftCount: number
  liveUrl: string | null
  connector: string | null
  lastOk: boolean | null
  views: number
  // For video-theme campaigns only: the render state of the lead draft's asset
  // ('none' | 'pending' | 'ready' | 'failed'). null for non-video campaigns.
  videoStatus: string | null
}

export async function listConsole(host: MarketingHost, orgId: string): Promise<Result<ConsoleRow[]>> {
  const campaigns = await host.store.select<Campaign>('ms_campaigns', { org_id: orgId })
  const rows: ConsoleRow[] = []
  for (const c of campaigns) {
    const drafts = await host.store.select<any>('ms_drafts', { campaign_id: c.id })
    const results = await host.store.select<any>('ms_publish_results', { campaign_id: c.id })
    // order is not guaranteed by the store; sort by 'at' to find the latest.
    const sorted = [...results].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
    const okResults = sorted.filter((r) => r.ok && r.live_url)
    const chosen = okResults.length ? okResults[okResults.length - 1] : sorted[sorted.length - 1]
    let views = 0
    try { views = await host.store.count('ms_events', { campaign_id: c.id, kind: 'view' }) } catch { views = 0 }

    // Video render state: only meaningful for video-theme campaigns. Read it from
    // the lead (en) draft, falling back to any draft that carries a status.
    let videoStatus: string | null = null
    if ((c as any).channel === 'video' && Array.isArray(drafts) && drafts.length) {
      const lead = drafts.find((d) => d.lang === 'en') || drafts[0]
      videoStatus = lead ? String(lead.asset_status || 'none') : 'none'
    }

    rows.push({
      campaign: c,
      draftCount: Array.isArray(drafts) ? drafts.length : 0,
      liveUrl: chosen ? (chosen.live_url || null) : null,
      connector: chosen ? (chosen.connector_id || null) : null,
      lastOk: chosen ? !!chosen.ok : null,
      views,
      videoStatus,
    })
  }
  rows.sort((a, b) => String(b.campaign.created_at || '').localeCompare(String(a.campaign.created_at || '')))
  return { ok: true, data: rows }
}
