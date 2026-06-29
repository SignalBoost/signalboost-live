// saas/marketing-sales-core/flow.ts
// The first vertical of the department, as pure host-injected functions:
// intake -> draft -> needs_approval -> human decision. Imports only the portable
// contracts and the lifecycle guard — never a host implementation. The same
// honesty discipline as the rest of the platform: a status only advances through
// a legal transition, and the human decision is the only path past needs_approval.
import type { MarketingHost, Campaign, Lang, DecisionOutcome, Actor, Result } from './types'
import { canTransition } from './lifecycle'

export async function createCampaign(
  host: MarketingHost,
  p: { orgId: string; actorId: string; objective: string; channel?: string | null },
): Promise<Result<Campaign>> {
  const objective = String(p.objective || '').trim()
  if (!objective) return { ok: false, error: 'objective is required' }
  const ts = host.now().toISOString()
  const c = await host.store.insert<Campaign>('ms_campaigns', {
    org_id: p.orgId, status: 'intake', objective, channel: p.channel || null,
    created_by: p.actorId, created_at: ts, updated_at: ts,
  })
  await host.log.logAction({ actor_id: p.actorId, org_id: p.orgId, action: 'campaign.created', detail: { id: c.id, objective } })
  return { ok: true, data: c }
}

export async function addDraftsAndQueue(
  host: MarketingHost,
  p: { campaign: Campaign; drafts: Array<{ lang: Lang; title: string; body: string }> },
): Promise<Result> {
  if (!p.drafts.length) return { ok: false, error: 'at least one language draft is required' }
  for (const d of p.drafts) {
    await host.store.insert('ms_drafts', {
      org_id: p.campaign.org_id, campaign_id: p.campaign.id, lang: d.lang,
      title: d.title, body: d.body, asset_url: null, asset_status: 'none',
    })
  }
  if (!canTransition('intake', 'drafting') || !canTransition('drafting', 'needs_approval')) {
    return { ok: false, error: 'illegal lifecycle transition' }
  }
  await host.store.update('ms_campaigns', p.campaign.id, { status: 'needs_approval', updated_at: host.now().toISOString() })
  await host.log.logAction({
    actor_id: p.campaign.created_by, org_id: p.campaign.org_id,
    action: 'campaign.queued_for_approval', detail: { id: p.campaign.id, langs: p.drafts.map((d) => d.lang) },
  })
  return { ok: true }
}

// The ONLY human (management) decision — owner/admin gated, charter outcome logged.
export async function decide(
  host: MarketingHost,
  p: { campaignId: string; actor: Actor; decision: 'approve' | 'edits' | 'reject' },
): Promise<Result<{ status: string }>> {
  if (!host.auth.canApprove(p.actor)) return { ok: false, error: 'not authorized to approve' }
  const rows = await host.store.select<Campaign>('ms_campaigns', { id: p.campaignId })
  const c = rows[0]
  if (!c) return { ok: false, error: 'campaign not found' }
  const target = p.decision === 'approve' ? 'approved' : p.decision === 'edits' ? 'edits_requested' : 'rejected'
  if (c.status !== 'needs_approval' || !canTransition('needs_approval', target)) {
    return { ok: false, error: `cannot ${p.decision} from ${c.status}` }
  }
  const outcome: DecisionOutcome = p.decision === 'approve' ? 'resolved' : p.decision === 'reject' ? 'accepted_risk' : 'open'
  await host.store.update('ms_campaigns', p.campaignId, { status: target, updated_at: host.now().toISOString() })
  await host.log.logAction({ actor_id: p.actor.id, org_id: p.actor.orgId, action: `campaign.${p.decision}`, outcome, detail: { id: p.campaignId } })
  return { ok: true, data: { status: target } }
}

export async function listForApproval(
  host: MarketingHost, orgId: string,
): Promise<Result<Array<{ campaign: Campaign; drafts: any[] }>>> {
  const campaigns = await host.store.select<Campaign>('ms_campaigns', { org_id: orgId, status: 'needs_approval' })
  const out: Array<{ campaign: Campaign; drafts: any[] }> = []
  for (const c of campaigns) {
    const drafts = await host.store.select('ms_drafts', { campaign_id: c.id })
    out.push({ campaign: c, drafts })
  }
  return { ok: true, data: out }
}
