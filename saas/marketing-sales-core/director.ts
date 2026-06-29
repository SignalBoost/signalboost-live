// saas/marketing-sales-core/director.ts
// The autonomous head, owner-light: on a schedule the director initiates a campaign
// and drops it into the approval queue. It NEVER approves and NEVER publishes — the
// human decision past needs_approval is untouched. Generation is INJECTED so the
// core stays portable (an adopter plugs in their own copy engine). Honesty by
// construction: it only queues a real, non-empty generation, and it caps itself so
// it can never flood the queue.
import type { MarketingHost, Lang, Result } from './types'
import { createCampaign, addDraftsAndQueue } from './flow'

export type GeneratedCampaign =
  | { objective: string; drafts: Array<{ lang: Lang; title: string; body: string }> }
  | null

export type GenerateFn = (ctx: { orgId: string }) => Promise<GeneratedCampaign>

export async function runDirector(
  host: MarketingHost,
  opts: { orgId: string; actorId: string; cap?: number; generate: GenerateFn },
): Promise<Result<{ initiated: number; pending: number; reason?: string }>> {
  const cap = opts.cap ?? 3

  // Never flood the human's approval queue.
  const pending = await host.store.count('ms_campaigns', { org_id: opts.orgId, status: 'needs_approval' })
  if (pending >= cap) {
    await host.log.logAction({ actor_id: opts.actorId, org_id: opts.orgId, action: 'director.skipped', detail: { pending, cap } })
    return { ok: true, data: { initiated: 0, pending, reason: 'queue at cap' } }
  }

  let gen: GeneratedCampaign = null
  try { gen = await opts.generate({ orgId: opts.orgId }) } catch { gen = null }

  // Honesty: never queue an empty or invalid generation.
  if (!gen || !gen.objective || !Array.isArray(gen.drafts) || gen.drafts.length === 0) {
    await host.log.logAction({ actor_id: opts.actorId, org_id: opts.orgId, action: 'director.no_output', detail: {} })
    return { ok: true, data: { initiated: 0, pending, reason: 'no generation' } }
  }

  const c = await createCampaign(host, { orgId: opts.orgId, actorId: opts.actorId, objective: gen.objective })
  if (!c.ok) return { ok: false, error: c.error }
  const q = await addDraftsAndQueue(host, { campaign: c.data, drafts: gen.drafts })
  if (!q.ok) return { ok: false, error: q.error }

  await host.log.logAction({
    actor_id: opts.actorId, org_id: opts.orgId, action: 'director.initiated',
    detail: { id: c.data.id, langs: gen.drafts.map((d) => d.lang) },
  })
  return { ok: true, data: { initiated: 1, pending: pending + 1 } }
}
