// saas/lib/ai/proposeCampaign.ts
// On-demand marketing campaign creation for the Chief of Staff.
// Video campaigns now go into the COS video production queue so the owner gets a
// real render job instead of only a written production specification.

import { createClient } from '@supabase/supabase-js'
import { createCampaign, addDraftsAndQueue } from '@/marketing-sales-core/flow'
import { createSignalBoostMarketingHost, signalboostActor } from '@/marketing-sales-host/signalboostHost'
import { queueVideoProductionJob } from '@/lib/cos/video-production'

const VALID_CHANNELS = ['video', 'social', 'blog', 'email', 'case-study', 'feature', 'youtube', 'short_video', 'linkedin'] as const
type Channel = typeof VALID_CHANNELS[number]

type CampaignToolShape = {
  goal?: string
  audience?: string
  channel?: string
  offer?: string
  sourceMaterial?: string
  language?: string
}

export type ProposeCampaignParams = CampaignToolShape & {
  objective?: string
  title?: string
  body?: string
  lang?: string
  actorUserId?: string
}

export interface ProposeCampaignResult {
  ok: boolean
  campaignId?: string
  videoJobId?: string
  status?: string
  persisted?: boolean
  error?: string
  message?: string
}

function clean(value: unknown, fallback = ''): string {
  return String(value || fallback).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizedChannel(value: unknown): Channel {
  const raw = clean(value, 'video').toLowerCase().replace(/\s+/g, '_')
  if (raw === 'youtube' || raw === 'short_video') return raw
  if (raw.includes('video') || raw.includes('reel') || raw.includes('short')) return 'video'
  if (VALID_CHANNELS.includes(raw as Channel)) return raw as Channel
  return 'video'
}

function isVideoChannel(channel: string): boolean {
  return channel === 'video' || channel === 'youtube' || channel === 'short_video'
}

function titleFrom(p: ProposeCampaignParams): string {
  return clean(p.title || p.offer || p.goal || p.objective, 'SignalBoostAi promotional video')
}

function objectiveFrom(p: ProposeCampaignParams): string {
  return clean(p.objective || p.goal || p.offer, 'Promote saas.signalboostapp.com to qualified business buyers')
}

function bodyFrom(p: ProposeCampaignParams): string {
  const source = clean(p.body || p.sourceMaterial || '')
  if (source.length >= 20) return source
  return [
    objectiveFrom(p),
    p.audience ? `Audience: ${clean(p.audience)}` : '',
    p.offer ? `Offer: ${clean(p.offer)}` : '',
  ].filter(Boolean).join(' ')
}

function voiceoverFrom(p: ProposeCampaignParams): string {
  const body = bodyFrom(p)
  const quoted = body.match(/[“"]([^“”"]{80,1200})[”"]/)
  if (quoted?.[1]) return clean(quoted[1])
  if (body.includes('SignalBoostAi helps businesses')) return body
  return 'SignalBoostAi helps businesses build websites, create branded content, turn reviews into marketing posts, and prepare outreach campaigns faster. From websites to content to growth workflows, SignalBoost gives small businesses and agencies one AI-powered system to look sharper and move faster. Start building smarter today at www.saas.signalboostapp.com.'
}

export async function proposeCampaign(p: ProposeCampaignParams): Promise<ProposeCampaignResult> {
  const channel = normalizedChannel(p.channel)
  const objective = objectiveFrom(p)
  const title = titleFrom(p)
  const body = bodyFrom(p)
  const lang = clean(p.lang || p.language, 'en').toLowerCase() || 'en'

  if (!objective) return { ok: false, error: 'objective is required' }
  if (!VALID_CHANNELS.includes(channel as Channel)) return { ok: false, error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` }
  if (!title || title.length < 5) return { ok: false, error: 'title must be a punchy on-screen hook line, at least 5 characters' }
  if (!body || body.length < 20) return { ok: false, error: 'body must describe the campaign in at least 20 characters' }

  if (isVideoChannel(channel)) {
    const result = await queueVideoProductionJob({
      title,
      hook: objective,
      audience: clean(p.audience, 'small businesses, agencies, hotels, restaurants, and entrepreneurs'),
      destination_url: 'www.saas.signalboostapp.com',
      url_text: 'www.saas.signalboostapp.com',
      brand_text: 'SignalBoostAi',
      voiceover: voiceoverFrom(p),
      captions: voiceoverFrom(p),
      format: channel === 'short_video' ? 'short_video' : 'youtube',
      duration_seconds: 60,
      production_tier: 'professional',
      platforms: channel === 'short_video' ? ['Shorts', 'Reels'] : ['YouTube', 'LinkedIn'],
    }, { queueImmediately: true, conceptApproved: true })

    if (!result.ok) {
      return {
        ok: false,
        persisted: result.persisted,
        status: result.status,
        error: result.error || result.warning || 'Video job could not be queued.',
      }
    }

    return {
      ok: true,
      persisted: result.persisted,
      videoJobId: result.id,
      status: result.status || 'queued',
      message: `Video render job queued for owner approval. Job id: ${result.id}. The worker must render an MP4 and the owner must approve the render before publishing.`,
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase service credentials not configured' }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const actor = signalboostActor({ id: clean(p.actorUserId, 'cos-owner') } as any)
  const host = createSignalBoostMarketingHost(admin, actor)

  const storedChannel = channel === 'youtube' || channel === 'short_video' ? 'video' : channel
  const c = await createCampaign(host, { orgId: actor.orgId, actorId: actor.id, objective, channel: storedChannel })
  if (!c.ok) return { ok: false, error: c.error }

  const q = await addDraftsAndQueue(host, { campaign: c.data, drafts: [{ lang, title, body }] })
  if (!q.ok) return { ok: false, error: q.error }

  return { ok: true, campaignId: c.data.id, status: 'needs_approval' }
}
