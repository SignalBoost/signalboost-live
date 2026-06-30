// saas/lib/ai/proposeCampaign.ts
// On-demand marketing campaign creation for the Chief of Staff. Goes through the
// EXACT same lifecycle functions the autonomous director uses (createCampaign,
// addDraftsAndQueue from marketing-sales-core/flow.ts), so a COS-initiated
// campaign is indistinguishable in the pipeline from one the director queued
// itself — same approval gate, same video/social automation once approved.
// The COS can choose the topic and channel; it can NEVER approve — that stays a
// human action via the existing /api/marketing-sales/decide route.

import { createClient } from '@supabase/supabase-js'
import { createCampaign, addDraftsAndQueue } from '@/marketing-sales-core/flow'
import { createSignalBoostMarketingHost, signalboostActor } from '@/marketing-sales-host/signalboostHost'

const VALID_CHANNELS = ['video', 'social', 'blog', 'email', 'case-study', 'feature'] as const
type Channel = typeof VALID_CHANNELS[number]

export interface ProposeCampaignParams {
  objective: string
  channel: string
  title: string
  body: string
  lang?: string
  actorUserId: string
}

export interface ProposeCampaignResult {
  ok: boolean
  campaignId?: string
  status?: string
  error?: string
}

export async function proposeCampaign(p: ProposeCampaignParams): Promise<ProposeCampaignResult> {
  const objective = String(p.objective || '').trim()
  const channel = String(p.channel || '').trim().toLowerCase()
  const title = String(p.title || '').trim()
  const body = String(p.body || '').trim()
  const lang = (String(p.lang || 'en').trim().toLowerCase() || 'en') as any

  if (!objective) return { ok: false, error: 'objective is required' }
  if (!VALID_CHANNELS.includes(channel as Channel)) return { ok: false, error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` }
  if (!title || title.length < 5) return { ok: false, error: 'title must be a punchy on-screen hook line, at least 5 characters' }
  if (!body || body.length < 20) return { ok: false, error: 'body must describe the voiceover/content in at least 20 characters' }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase service credentials not configured' }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const actor = signalboostActor({ id: p.actorUserId } as any)
  const host = createSignalBoostMarketingHost(admin, actor)

  const c = await createCampaign(host, { orgId: actor.orgId, actorId: actor.id, objective, channel })
  if (!c.ok) return { ok: false, error: c.error }

  const q = await addDraftsAndQueue(host, { campaign: c.data, drafts: [{ lang, title, body }] })
  if (!q.ok) return { ok: false, error: q.error }

  return { ok: true, campaignId: c.data.id, status: 'needs_approval' }
}
