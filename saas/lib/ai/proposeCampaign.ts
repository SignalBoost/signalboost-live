// saas/lib/ai/proposeCampaign.ts
// On-demand COS marketing campaign creation for the Chief of Staff chat tool.
// Creates real cos_campaign_queue rows, injects the requested script/CTA as
// draft output, and starts the internal render pipeline immediately — so
// the owner reviews ACTUAL finished videos, not a text promise.
//
// APPROVAL MODEL (owner's vision): COSA prepares everything first; rows are
// created as waiting_approval. The owner's single Approve click (dashboard)
// stamps approved_by, and the cos-auto-publish cron then publishes
// automatically once branding + quality gates pass, emailing the live link.
// No human Publish click needed. approved_by is a uuid column: it is only
// ever a real user uuid (stamped at approval) or null — never a marker string.

import { createClient } from '@supabase/supabase-js'
import { queueItemFromRecommendation } from '@/lib/cos/campaign-queue'
import type { CosChannel, CosDepartment, CosPriority, CosRecommendation } from '@/lib/cos/recommendation/types'
import { startSiteVideo } from '@/lib/operator/video'

const SAAS_URL = 'www.saas.signalboostapp.com'
const VIDEO_CHANNELS = new Set(['youtube', 'short_video'])
const allowedLanguages = ['en', 'es', 'pt', 'pl', 'ru']

type RegionalSpec = {
  lang: string
  region: string
  label: string
  audience: string
  angle: string
}

const REGIONAL_SPECS: RegionalSpec[] = [
  {
    lang: 'en',
    region: 'us',
    label: 'English / United States',
    audience: 'U.S. small businesses, agencies, consultants, startups, restaurants, hotels, and sales teams.',
    angle: 'Launch campaigns faster with minimal manual work while preserving human approval and control.',
  },
  {
    lang: 'es',
    region: 'latam',
    label: 'Spanish / LATAM',
    audience: 'LATAM business owners, agencies, hotels, restaurants, consultants, and entrepreneurs. Use neutral Latin American Spanish, not Mexico-only Spanish.',
    angle: 'Create professional marketing campaigns without a large marketing team, with practical mobile-first growth workflows.',
  },
  {
    lang: 'pt',
    region: 'brazil',
    label: 'Portuguese / Brazil',
    audience: 'Brazilian small businesses, agencies, entrepreneurs, restaurants, hotels, and service companies.',
    angle: 'Turn a business idea into a campaign faster with professional content and outreach preparation in Brazilian Portuguese.',
  },
  {
    lang: 'pl',
    region: 'poland',
    label: 'Polish / Poland',
    audience: 'Polish business owners, startups, agencies, consultants, and service companies.',
    angle: 'Controlled AI automation for serious businesses that want speed without losing oversight.',
  },
  {
    lang: 'ru',
    region: 'global_ru',
    label: 'Russian / Global Russian-speaking audience',
    audience: 'Russian-speaking entrepreneurs, agencies, consultants, and business operators. Avoid political framing completely.',
    angle: 'Structured AI campaign execution with speed, clarity, multilingual outreach, analytics, and human approval.',
  },
]

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
  const explicit = text(args.voiceover || args.script || args.body || args.sourceMaterial || '', '', 1400)
  if (explicit) return explicit
  return `SignalBoostAi helps businesses build websites, create branded content, turn reviews into marketing posts, and prepare outreach campaigns faster. From websites to content to growth workflows, SignalBoost gives small businesses and agencies one AI-powered system to look sharper and move faster. Start building smarter today at ${SAAS_URL}.`
}

function visualPrompt(goal: string, audience: string, region?: string) {
  return [
    'Premium AI SaaS product demo b-roll for a business growth platform.',
    `Theme: ${goal}.`,
    `Audience: ${audience}.`,
    region ? `Regional market: ${region}.` : '',
    'Modern dark navy and black SaaS dashboards, gold and cyan accents, website previews, AI automation workflows, branded content cards, outreach dashboard, growth charts, small business owners, agency operators, hotel and restaurant entrepreneurs, smooth professional camera motion.',
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

function wantsRegionalBatch(args: any) {
  const body = `${args?.goal || ''} ${args?.objective || ''} ${args?.sourceMaterial || ''} ${args?.title || ''}`.toLowerCase()
  if (String(args?.language || args?.lang || '').toLowerCase() === 'all') return true
  return (
    body.includes('five separate') ||
    body.includes('five regional') ||
    body.includes('region-specific') ||
    body.includes('multilingual') ||
    (body.includes('latam') && body.includes('brazil') && body.includes('poland'))
  )
}

function regionalScript(spec: RegionalSpec, offer: string) {
  return `SignalBoostAi helps ${spec.audience} start outreach and marketing campaigns with minimal manual work. ${spec.angle} A business owner describes what they want to promote, and COSA prepares the campaign plan, messaging, promotional video, captions, localized copy, outreach content, tracking links, and performance measurement. Every asset goes to review before publishing. Human approval preserved. Human control maintained. AI builds the campaign — humans stay in control. ${offer}`
}

export interface ProposeCampaignResult {
  ok: boolean
  campaignId?: string
  campaignIds?: string[]
  status?: string
  render?: any
  error?: string
}

async function createOneCampaign(admin: any, args: any, spec?: RegionalSpec): Promise<{ ok: boolean; campaignId?: string; render?: any; error?: string }> {
  const baseGoal = text(args?.goal || args?.objective || args?.sourceMaterial, 'Create a SignalBoostAi promotional video campaign.', 1200)
  const channel = channelOf(args?.channel || baseGoal)
  const lang = spec?.lang || langOf(args?.language || args?.lang)
  const audience = spec?.audience || text(args?.audience, 'Small businesses, agencies, hotels, restaurants, and entrepreneurs.', 400)
  const offer = text(args?.offer || args?.callToAction, `Start your free trial at ${SAAS_URL}.`, 300)
  const regionNote = spec ? ` Region: ${spec.region}. Language: ${spec.label}.` : ''
  const goal = spec ? `${spec.angle} ${regionNote} ${baseGoal}` : baseGoal
  const title = spec ? `SignalBoostAi demo — ${spec.label}` : titleFrom(args, channel)
  const script = spec ? regionalScript(spec, offer) : scriptFrom(args)
  const now = new Date().toISOString()

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
    reason: 'Owner/COS requested an executable marketing campaign from chat. Prepare the full video for owner review; publishing happens automatically after the owner approves.',
    signals: [{ id: id('signal'), source: 'cos_chat_video_campaign_tool', metric: 'owner_campaign_request', value: title, confidence: 95, observed_at: now, evidence: [goal, script] }],
    approval_status: 'pending_approval',
    created_at: now,
  }

  const item = queueItemFromRecommendation(recommendation)
  const row: any = rowFromQueueItem(item)
  row.status = 'waiting_approval'
  row.approval_required = true
  row.approved_by = null
  row.approved_at = null
  row.languages = [lang]
  row.work_items = (Array.isArray(row.work_items) ? row.work_items : []).map((w: any) => ({
    ...w,
    status: 'drafted',
    input: { ...(w.input || {}), language: lang, region: spec?.region || null },
    output: {
      title,
      opening: 'SignalBoostAi helps businesses move faster with AI-powered marketing and growth workflows.',
      draft: script,
      call_to_action: offer,
    },
  }))
  row.metadata = {
    ...(row.metadata || {}),
    source: spec ? 'cos_chat_regional_video_batch_tool' : 'cos_chat_video_campaign_tool',
    owner_review_note: 'Production runs automatically. After you Approve, publishing is automatic once the video is branded and passes quality gates; you will be emailed the live link.',
    required_burned_in_text: ['SignalBoostAi', SAAS_URL],
    regional_campaign: spec ? { language: spec.lang, region: spec.region, label: spec.label, angle: spec.angle } : null,
  }

  let render: any = null
  if (VIDEO_CHANNELS.has(channel)) {
    const aspect: '16:9' | '9:16' = channel === 'short_video' ? '9:16' : '16:9'
    const prompt = visualPrompt(goal, audience, spec?.region)
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
        brandedLangs: {},
        unbrandedVoiced: {},
        brandSchemaVersion: null,
        brandText: null,
        brandedAt: null,
        voiceError: null,
        brandAttempts: {},
        ghOverlayAttempts: {},
        brandingLock: null,
      }
    }
  }

  const { data, error } = await admin.from('cos_campaign_queue').insert(row).select('*').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, campaignId: data.id, render }
}

export async function proposeCampaign(args: any, _approvedByUserId?: string | null): Promise<ProposeCampaignResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase service credentials not configured' }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  if (wantsRegionalBatch(args)) {
    const results = []
    for (const spec of REGIONAL_SPECS) {
      const result = await createOneCampaign(admin, args, spec)
      results.push({ ...result, language: spec.lang, region: spec.region })
    }
    const failures = results.filter(r => !r.ok)
    const ids = results.map(r => r.campaignId).filter(Boolean) as string[]
    if (!ids.length) return { ok: false, error: failures[0]?.error || 'No regional campaigns were created.', render: { results } }
    return {
      ok: failures.length === 0,
      campaignId: ids[0],
      campaignIds: ids,
      status: failures.length ? 'partial' : 'rendering',
      render: { regionalBatch: true, created: ids.length, failed: failures.length, results },
      error: failures.length ? `${failures.length} regional campaign(s) failed to create.` : undefined,
    }
  }

  const result = await createOneCampaign(admin, args)
  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok: true,
    campaignId: result.campaignId,
    status: result.render?.ok ? 'rendering' : 'created',
    render: result.render,
  }
}
