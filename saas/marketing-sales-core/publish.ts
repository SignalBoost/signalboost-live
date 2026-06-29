// saas/marketing-sales-core/publish.ts
// The publish step of the lifecycle, portable and host-injected:
// approved -> publishing -> published | publish_failed. It resolves the chosen
// connector, runs it, records a real result row, and only marks 'published' when
// the connector returns a real liveUrl. Unconnected or unfinished connectors are
// refused with a localizable error code — never a faked publish.
import type { MarketingHost, Campaign, Draft, Lang, Result } from './types'
import { canTransition } from './lifecycle'
import { resolveExecutor } from './executors/registry'
// Ensure publishers are registered regardless of who imports this module.
import './executors/youtube'
import './executors/tiktok'
import './executors/linkedin'
import './executors/site'

export async function publishCampaign(
  host: MarketingHost,
  p: { campaignId: string; connectorId: string; actorId: string; lang?: Lang },
): Promise<Result<{ status: string; liveUrl?: string; errorCode?: string }>> {
  const rows = await host.store.select<Campaign>('ms_campaigns', { id: p.campaignId })
  const c = rows[0]
  if (!c) return { ok: false, error: 'campaign not found' }
  if (c.status !== 'approved' && c.status !== 'publish_failed') {
    return { ok: false, error: `cannot publish from ${c.status}` }
  }

  const ex = resolveExecutor(p.connectorId)
  if (!ex) return { ok: false, error: 'unknown connector', data: { status: c.status, errorCode: 'errNotConnected' } }
  if (!ex.capabilities.publish) {
    await host.log.logAction({ actor_id: p.actorId, org_id: c.org_id, action: 'campaign.publish_refused', detail: { connector: p.connectorId } })
    return { ok: false, error: 'connector not publishable', data: { status: c.status, errorCode: 'errPlatformPending' } }
  }

  if (!canTransition(c.status, 'publishing')) return { ok: false, error: 'illegal transition' }
  await host.store.update('ms_campaigns', c.id, { status: 'publishing', updated_at: host.now().toISOString() })

  const drafts = await host.store.select<Draft>('ms_drafts', { campaign_id: c.id })
  const draft = (p.lang && drafts.find((d) => d.lang === p.lang)) || drafts.find((d) => d.lang === 'en') || drafts[0]
  if (!draft) {
    await host.store.update('ms_campaigns', c.id, { status: 'publish_failed', updated_at: host.now().toISOString() })
    return { ok: false, error: 'no drafts to publish', data: { status: 'publish_failed', errorCode: 'errUnknown' } }
  }

  let res: any
  try { res = await ex.run(draft, host) } catch (e: any) { res = { ok: false, errorCode: 'errUnknown', error: e?.message } }

  await host.store.insert('ms_publish_results', {
    org_id: c.org_id, campaign_id: c.id, connector_id: p.connectorId,
    live_url: res.liveUrl || null, external_id: res.externalId || null,
    ok: !!res.ok, error: res.error || null,
  })

  if (res.ok && res.liveUrl) {
    await host.store.update('ms_campaigns', c.id, { status: 'published', updated_at: host.now().toISOString() })
    await host.log.logAction({ actor_id: p.actorId, org_id: c.org_id, action: 'campaign.published', detail: { id: c.id, connector: p.connectorId, liveUrl: res.liveUrl } })
    return { ok: true, data: { status: 'published', liveUrl: res.liveUrl } }
  }

  await host.store.update('ms_campaigns', c.id, { status: 'publish_failed', updated_at: host.now().toISOString() })
  await host.log.logAction({ actor_id: p.actorId, org_id: c.org_id, action: 'campaign.publish_failed', outcome: 'open', detail: { id: c.id, connector: p.connectorId, errorCode: res.errorCode } })
  return { ok: false, error: res.error || 'publish failed', data: { status: 'publish_failed', errorCode: res.errorCode || 'errUnknown' } }
}
