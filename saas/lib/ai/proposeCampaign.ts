// saas/lib/ai/proposeCampaign.ts
// On-demand COS marketing campaign creation for the Chief of Staff chat tool.
// This is not just a written proposal anymore: for video-style channels it
// creates a real cos_campaign_queue row, injects the requested script/CTA as the
// draft output, and starts the internal render pipeline. Publishing remains
// owner-gated by the existing publish route.
//
// FIX: approved_by is a uuid column — writing the string marker
// 'cos_internal_preparation' into it made Postgres reject EVERY chat-created
// campaign ("invalid input syntax for type uuid"). approved_by now carries a
// real user uuid (when the caller knows it) or null; the "approved via owner
// chat command" semantics live in metadata.approved_via, where strings belong.

import { createClient } from '@supabase/supabase-js'
import { queueItemFromRecommendation } from '@/lib/cos/campaign-queue'
import type { CosChannel, CosDepartment, CosPriority, CosRecommendation } from '@/lib/cos/recommendation/types'
import { startSiteVideo } from '@/lib/operator/video'

const SAAS_URL = 'www.saas.signalboostapp.com'
const VIDEO_CHANNELS = new Set(['youtube', 'short_video'])
const allowedLanguages = ['en', 'es', 'pt', 'pl', 'ru']

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function text(value: any, fallback = '', max = 1600) {
  const out = String(value || '').replace(/\s+/g, ' ').trim()
  return (out || fallback).slice(0, max)
}

function langOf(value: any) {
  const l = String(value || 'en').toLowerCase().trim()
  return allowedLanguages.includes(l) ? l : 'en'
}

function channelOf(value: any): CosChannel {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('short') || raw.includes('tiktok') || raw.includes('reel')) return 'short_video'
  if (raw.includes('linkedin')) return 'linkedin'
  if (raw.includes('blog')) return 'blog'
  if (raw.includes('email')) return 'email'
  if (raw.includes('outreach')) return 'outreach'
  if (raw.includes('landing')) return 'landing_page'
  if (raw.includes('review')) return 'review_campaign'
  return 'youtube'
}

function departmentOf(channel: CosChannel): CosDepartment {
  return channel === 'email' || channel === 'outreach' ? 'sales' : 'marketing'
}

function titleFrom(args: any, channel: CosChannel) {
  return text(args.title || args.goal || args.objective, channel === 'short_video' ? 'SignalBoostAi short promo video' : 'SignalBoostAi promotional video', 140)
}

function scriptFrom(args: any) {
  const explicit = text(args.voiceover || args.script || args.body || '', '', 1400)
  if (explicit) return explicit
  return `SignalBoostAi helps businesses build websites, create branded content, turn reviews into marketing posts, and prepare outreach campaigns faster. From websites to content to growth workflows, SignalBoost gives small businesses and agencies one AI-powered system to look sharper and move faster. Start building smarter today at ${SAAS_URL}.`
}

function visualPrompt(goal: string, audience: string) {
  return [
    'Cinematic promotional b-roll for a premium AI SaaS business platform.',
    `Theme: ${goal}.`,
    `Audience: ${audience}.`,
    'Modern dark navy and black SaaS dashboards, gold and cyan accents, website previews, AI automation workflows, branded content cards, outreach dashboard, growth charts, small business owners, agency operators, hotel and restaurant entrepreneurs, smooth premium commercial camera motion.',
    'Absolutely no on-screen text, no words, no letters, no captions, no subtitles, no logos, no signage, no watermarks, no URLs.'
  ].join(' ').slice(0, 900)
}

function rowFromQueueItem(item: ReturnType<typeof queueItemFromRecommendation>) {
  return {
    recommendation_id: item.recommendation_id,
    department: item.department,
    title: item.title,
    objective: item.objective,
    channel: item.channel,
    audience: item.audience,
    languages: item.languages,
    assets: item.assets,
    work_items: item.work_items,
    recommendation: item.recommendation,
    status: item.status,
    risk_level: item.risk_level,
    approval_required: item.approval_required,
    metadata: item.metadata || {},
  }
}

export interface ProposeCampaignResult {
  ok: boolean
  campaignId?: string
  status?: string
  render?: any
  error?: string
}

export async function proposeCampaign(args: any, approvedByUserId?: string | null): Promise<ProposeCampaignResult> {
  const goal = text(args?.goal || args?.objective || args?.sourceMaterial, 'Create a SignalBoostAi promotional video campaign.', 1200)
  const audience = text(args?.audience, 'Small businesses, agencies, hotels, restaurants, and entrepreneurs.', 400)
  const channel = channelOf(args?.channel || goal)
  const lang = langOf(args?.language || args?.lang)
  const title = titleFrom(args, channel)
  const script = scriptFrom(args)
  const offer = text(args?.offer || args?.callToAction, `Start building smarter today at ${SAAS_URL}.`, 300)
  const now = new Date().toISOString()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase service credentials not configured' }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const recommendation: CosRecommendation = {
    id: id('rec_cos_video'),
    department: departmentOf(channel),
    title,
    summary: `${goal} Target audience: ${audience}. CTA: ${offer}.`,
    recommended_channel: channel,
    priority: 'high' as CosPriority,
    confidence: 90,
    expected_roi: 'medium',
    estimated_cost_usd: VIDEO_CHANNELS.has(channel) ? 12 : 5,
    reason: 'Owner/COS requested an executable marketing campaign from chat. Create the campaign, prepare the internal video asset, and keep publishing gated.',
    signals: [{ id: id('signal'), source: 'cos_chat_video_campaign_tool', metric: 'owner_campaign_request', value: title, confidence: 95, observed_at: now, evidence: [goal, script] }],
    approval_status: 'pending_approval',
    created_at: now,
  }

  const item = queueItemFromRecommendation(recommendation)
  const row: any = rowFromQueueItem(item)
  row.status = VIDEO_CHANNELS.has(channel) ? 'approved' : 'waiting_approval'
  row.approval_required = true
  // uuid column: real user uuid when known, else null — NEVER a string marker.
  row.approved_by = VIDEO_CHANNELS.has(channel) ? (approvedByUserId || null) : null
  row.approved_at = VIDEO_CHANNELS.has(channel) ? now : null
  row.languages = [lang]
  row.work_items = (Array.isArray(row.work_items) ? row.work_items : []).map((w: any) => ({
    ...w,
    status: 'drafted',
    input: { ...(w.input || {}), language: lang },
    output: {
      title,
      opening: 'SignalBoostAi helps businesses move faster with AI-powered marketing and growth workflows.',
      draft: script,
      call_to_action: offer,
    },
  }))
  row.metadata = {
    ...(row.metadata || {}),
    source: 'cos_chat_video_campaign_tool',
    approved_via: VIDEO_CHANNELS.has(channel) ? 'owner_chat_command' : null,
    owner_review_note: 'Internal production may run automatically. Public publishing remains locked until the owner clicks Publish.',
    required_burned_in_text: ['SignalBoostAi', SAAS_URL],
  }

  let render: any = null
  if (VIDEO_CHANNELS.has(channel)) {
    const aspect: '16:9' | '9:16' = channel === 'short_video' ? '9:16' : '16:9'
    const prompt = visualPrompt(goal, audience)
    const started = await startSiteVideo(prompt, aspect)
    render = started
    if (started.ok) {
      row.metadata.video = {
        status: 'rendering',
        requestId: started.requestId,
        model: started.model,
        aspect,
        prompt,
        started_at: now,
        voicedUrl: null,
        voiced: {},
        branded: false,
        brandSchemaVersion: null,
        brandText: null,
        brandedAt: null,
        voiceError: null,
        brandAttempts: {},
        brandingLock: null,
      }
    }
  }

  const { data, error } = await admin.from('cos_campaign_queue').insert(row).select('*').single()
  if (error) return { ok: false, error: error.message }

  return {
    ok: true,
    campaignId: data.id,
    status: row.metadata?.video?.status || data.status || 'created',
    render,
  }
}
