import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import { buildDefaultMarketingRecommendation } from '@/lib/cos/recommendation/engine'
import type { CosChannel, CosDepartment, CosPriority, CosRecommendation } from '@/lib/cos/recommendation/types'
import { queueItemFromRecommendation } from '@/lib/cos/campaign-queue'
import { autoPublishApprovedCampaign } from '@/lib/cos/campaign-queue/publish-core'
import type { CosCampaignQueueStatus } from '@/lib/cos/campaign-queue'

export const dynamic = 'force-dynamic'

const NEW_DESTINATION = ['www', 'saas', 'signalboostapp', 'com'].join('.')
const OLD_DESTINATION = ['signalboostapp', 'com'].join('.')
const DUPLICATE_DESTINATION = ['www', 'saas', 'www', 'saas', 'signalboostapp', 'com'].join('.')
const WWW_OLD_DESTINATION = ['www', 'signalboostapp', 'com'].join('.')
const SAAS_URL = 'www.saas.signalboostapp.com'

const allowedStatuses: CosCampaignQueueStatus[] = [
  'draft',
  'waiting_approval',
  'approved',
  'queued',
  'running',
  'completed',
  'measured',
  'learned',
  'rejected',
]

const allowedRequestChannels: CosChannel[] = [
  'youtube',
  'short_video',
  'linkedin',
  'blog',
  'email',
  'outreach',
  'landing_page',
  'review_campaign',
]

const allowedDepartments: CosDepartment[] = ['marketing', 'sales']
const allowedPriorities: CosPriority[] = ['low', 'medium', 'high', 'critical']
const allowedLanguages = ['en', 'es', 'pt', 'pl', 'ru'] as const

type SupportedCampaignLanguage = typeof allowedLanguages[number]

function normalizeStatus(value: unknown): CosCampaignQueueStatus | null {
  if (typeof value !== 'string') return null
  return allowedStatuses.includes(value as CosCampaignQueueStatus) ? value as CosCampaignQueueStatus : null
}

function cleanDestination(value: any): any {
  if (typeof value === 'string') {
    return value
      .split(DUPLICATE_DESTINATION).join(NEW_DESTINATION)
      .split(WWW_OLD_DESTINATION).join(NEW_DESTINATION)
      .split(`Visit ${OLD_DESTINATION}`).join(`Visit ${NEW_DESTINATION}`)
      .split(`URL on screen: ${OLD_DESTINATION}`).join(`URL on screen: ${NEW_DESTINATION}`)
      .split(`CTA: Visit ${OLD_DESTINATION}`).join(`CTA: Visit ${NEW_DESTINATION}`)
  }
  if (Array.isArray(value)) return value.map(cleanDestination)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanDestination(item)]))
  return value
}

function dbRowFromQueueItem(item: ReturnType<typeof queueItemFromRecommendation>) {
  return {
    recommendation_id: item.recommendation_id,
    department: item.department,
    title: item.title,
    objective: item.objective,
    channel: item.channel,
    audience: item.audience,
    languages: item.languages,
    assets: item.assets,
    work_items: cleanDestination(item.work_items),
    recommendation: item.recommendation,
    status: item.status,
    risk_level: item.risk_level,
    approval_required: item.approval_required,
    metadata: item.metadata || {},
  }
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function cleanString(value: unknown, fallback: string, maxLength = 280) {
  if (typeof value !== 'string') return fallback
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, maxLength) : fallback
}

function cleanLongText(value: unknown, fallback: string, maxLength = 1_500) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : fallback
}

function normalizeChannel(value: unknown): CosChannel {
  if (typeof value === 'string' && allowedRequestChannels.includes(value as CosChannel)) return value as CosChannel
  return 'youtube'
}

function normalizePriority(value: unknown): CosPriority {
  if (typeof value === 'string' && allowedPriorities.includes(value as CosPriority)) return value as CosPriority
  return 'medium'
}

function normalizeLanguage(value: unknown): SupportedCampaignLanguage {
  if (typeof value === 'string' && (allowedLanguages as readonly string[]).includes(value)) return value as SupportedCampaignLanguage
  return 'en'
}

function normalizeDepartment(value: unknown, channel: CosChannel): CosDepartment {
  if (typeof value === 'string' && allowedDepartments.includes(value as CosDepartment)) return value as CosDepartment
  if (channel === 'email' || channel === 'outreach') return 'sales'
  return 'marketing'
}

function normalizeEstimatedCost(value: unknown, channel: CosChannel) {
  const defaultCost = channel === 'youtube' || channel === 'short_video' ? 12 : channel === 'email' || channel === 'outreach' ? 3 : 5
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return defaultCost
  return Math.min(500, Math.round(numeric * 100) / 100)
}

function titleForChannel(channel: CosChannel) {
  switch (channel) {
    case 'youtube': return 'Create an educational YouTube campaign'
    case 'short_video': return 'Create a short-form campaign'
    case 'linkedin': return 'Create a LinkedIn authority campaign'
    case 'blog': return 'Create an SEO education campaign'
    case 'email': return 'Create a sales email campaign'
    case 'outreach': return 'Create a targeted outreach campaign'
    case 'landing_page': return 'Create a conversion landing page campaign'
    case 'review_campaign': return 'Create a customer proof campaign'
    default: return 'Create a governed growth campaign'
  }
}

function confidenceForPriority(priority: CosPriority) {
  if (priority === 'critical') return 88
  if (priority === 'high') return 82
  if (priority === 'medium') return 74
  return 66
}

function expectedRoiForPriority(priority: CosPriority): CosRecommendation['expected_roi'] {
  if (priority === 'critical' || priority === 'high') return 'high'
  if (priority === 'medium') return 'medium'
  return 'unknown'
}

function channelFromDirective(text: string): CosChannel {
  const lower = text.toLowerCase()
  if (lower.includes('tiktok') || lower.includes('short') || lower.includes('reel')) return 'short_video'
  if (lower.includes('youtube') || lower.includes('video')) return 'youtube'
  if (lower.includes('linkedin')) return 'linkedin'
  if (lower.includes('email')) return 'email'
  if (lower.includes('outreach')) return 'outreach'
  if (lower.includes('blog') || lower.includes('seo')) return 'blog'
  return 'youtube'
}

function secondaryChannelsFromDirective(text: string) {
  const lower = text.toLowerCase()
  const channels: string[] = []
  if (lower.includes('youtube') || lower.includes('video')) channels.push('youtube')
  if (lower.includes('tiktok') || lower.includes('short')) channels.push('tiktok')
  if (lower.includes('linkedin')) channels.push('linkedin')
  if (lower.includes('email')) channels.push('email')
  if (lower.includes('blog') || lower.includes('seo')) channels.push('blog')
  return channels.length ? Array.from(new Set(channels)) : ['youtube', 'tiktok', 'linkedin']
}

function requestFromAutonomousDirective(input: unknown) {
  if (typeof input !== 'string') return null
  const directive = input.replace(/\s+/g, ' ').trim().slice(0, 1_200)
  if (directive.length < 8) return null
  const channel = channelFromDirective(directive)
  const secondaryChannels = secondaryChannelsFromDirective(directive)
  return {
    title: 'Autonomous online outreach campaign for SignalBoost',
    objective: `Create a short, impactful, review-ready outreach campaign from this owner directive: "${directive}". Feature ${SAAS_URL}. Explain the products and services that help companies grow, keep the message enterprise-ready, and prepare the campaign for ${secondaryChannels.join(', ')} distribution after owner approval.`,
    channel,
    department: channel === 'email' || channel === 'outreach' ? 'sales' : 'marketing',
    audience: 'Business owners, operators, and enterprise buyers looking for AI-assisted growth, marketing, sales, audit, cybersecurity, and optimization workflows.',
    language: 'en',
    priority: 'high',
    estimatedCostUsd: channel === 'short_video' || channel === 'youtube' ? 12 : 5,
    signal: `Autonomous COSA command. Secondary channels: ${secondaryChannels.join(', ')}. Directive: ${directive}`,
    autonomous: true,
    secondaryChannels,
  }
}

function recommendationFromDepartmentRequest(input: unknown): CosRecommendation | null {
  if (!input || typeof input !== 'object') return null
  const request = input as Record<string, unknown>
  const channel = normalizeChannel(request.channel)
  const priority = normalizePriority(request.priority)
  const language = normalizeLanguage(request.language)
  const department = normalizeDepartment(request.department, channel)
  const audience = cleanString(request.audience, 'Small business owners and operators who need more growth capacity without adding manual work.', 240)
  const objective = cleanLongText(
    request.objective,
    'Create an owner-approved campaign that explains the business problem first, then presents SignalBoost as the solution.',
    1_200,
  )
  const signal = cleanLongText(request.signal, 'Founder/operator submitted a Marketing/Sales department request.', 700)
  const title = cleanString(request.title, titleForChannel(channel), 140)
  const estimatedCostUsd = normalizeEstimatedCost(request.estimatedCostUsd, channel)
  const now = new Date().toISOString()
  const summary = [
    objective,
    `Target audience: ${audience}.`,
    `Requested language: ${language}.`,
    `Execution rule: draft, approval, final polish, publishing, monitoring, and learning must remain behind owner-approved workflow gates.`,
  ].join(' ')

  return {
    id: id(request.autonomous ? 'rec_auto' : 'rec_manual'),
    department,
    title,
    summary,
    recommended_channel: channel,
    priority,
    confidence: confidenceForPriority(priority),
    expected_roi: expectedRoiForPriority(priority),
    estimated_cost_usd: estimatedCostUsd,
    reason: request.autonomous
      ? `Autonomous COSA command interpreted into a governed campaign. Channel=${channel}; priority=${priority}; language=${language}.`
      : `Marketing/Sales department request created by an administrator. Channel=${channel}; priority=${priority}; language=${language}.`,
    signals: [
      {
        id: id('signal'),
        source: request.autonomous ? 'autonomous_cosa_campaign_command' : 'marketing_sales_department_request',
        metric: 'campaign_request',
        value: title,
        confidence: confidenceForPriority(priority),
        observed_at: now,
        evidence: [objective, signal],
      },
      {
        id: id('audience'),
        source: request.autonomous ? 'autonomous_cosa_campaign_command' : 'marketing_sales_department_request',
        metric: 'target_audience',
        value: audience,
        confidence: 90,
        observed_at: now,
        evidence: ['Preserved from the campaign request.'],
      },
      {
        id: id('language'),
        source: request.autonomous ? 'autonomous_cosa_campaign_command' : 'marketing_sales_department_request',
        metric: 'requested_language',
        value: language,
        confidence: 90,
        observed_at: now,
        evidence: ['Primary language requested before localization expansion.'],
      },
    ],
    approval_status: 'pending_approval',
    created_at: now,
  }
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const status = normalizeStatus(req.nextUrl.searchParams.get('status'))
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get('limit') || 50))

  let query = ctx.admin
    .from('cos_campaign_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, campaigns: [] }, { status: 500 })
  }

  return NextResponse.json({ ok: true, campaigns: cleanDestination(data || []) })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any = null
  try { body = await req.json() } catch { body = {} }

  let recommendation: CosRecommendation
  if (body?.recommendation) {
    recommendation = body.recommendation as CosRecommendation
  } else if (typeof body?.directive === 'string') {
    const request = requestFromAutonomousDirective(body.directive)
    const built = recommendationFromDepartmentRequest({ ...(request || {}), ...(body.request || {}) })
    if (!built) return NextResponse.json({ ok: false, error: 'A valid autonomous directive is required.' }, { status: 400 })
    recommendation = built
  } else if ('request' in (body || {})) {
    const built = recommendationFromDepartmentRequest(body.request)
    if (!built) return NextResponse.json({ ok: false, error: 'A valid campaign request is required.' }, { status: 400 })
    recommendation = built
  } else {
    recommendation = buildDefaultMarketingRecommendation()
  }

  if (!recommendation?.id || !recommendation?.title || !recommendation?.recommended_channel) {
    return NextResponse.json({ ok: false, error: 'A valid COS recommendation is required.' }, { status: 400 })
  }

  const queueItem = queueItemFromRecommendation(recommendation)
  const row = dbRowFromQueueItem(queueItem)
  row.metadata = {
    ...(row.metadata || {}),
    autonomous: recommendation.signals?.[0]?.source === 'autonomous_cosa_campaign_command',
    publishing_gate: 'locked_until_owner_approval',
  }

  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .insert(row)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: 'cos_campaign.create',
    targetType: 'cos_campaign_queue',
    targetId: data.id,
    metadata: { recommendation_id: recommendation.id, channel: recommendation.recommended_channel, source: recommendation.signals?.[0]?.source || 'cos' },
  })

  return NextResponse.json({ ok: true, campaign: cleanDestination(data) })
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const id = String(body?.id || '').trim()
  if (!id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })

  const status = normalizeStatus(body?.status)
  if (!status) return NextResponse.json({ ok: false, error: 'Valid status is required.' }, { status: 400 })

  const patch: Record<string, unknown> = { status }
  if (status === 'approved') {
    patch.approved_by = ctx.user.id
    patch.approved_at = new Date().toISOString()
  }
  if (status === 'rejected') {
    patch.approved_by = null
    patch.approved_at = null
  }
  if (body?.metadata !== undefined) patch.metadata = cleanDestination(body.metadata)
  if (body?.work_items !== undefined) patch.work_items = cleanDestination(body.work_items)

  const { data, error } = await ctx.admin
    .from('cos_campaign_queue')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: ctx.user.id,
    action: `cos_campaign.${status}`,
    targetType: 'cos_campaign_queue',
    targetId: id,
    metadata: { fields: Object.keys(patch) },
  })

  // AUTO-PUBLISH ON APPROVAL — the owner approves, the AI does the rest.
  // Runs the full guarded pipeline (video ready + branded, quality gate,
  // tracking link, live post, owner email) for every drafted language with a
  // voiced render. Failures never break the approval itself: every outcome is
  // returned here AND written to metadata.autoPublish, so nothing dies silently.
  let autoPublish: any = null
  if (status === 'approved') {
    try {
      autoPublish = await autoPublishApprovedCampaign({
        admin: ctx.admin,
        userId: ctx.user.id,
        userEmail: ctx.user.email || null,
        campaignId: id,
      })
    } catch (e: any) {
      autoPublish = { attempted: 0, published: 0, results: [{ language: null, ok: false, error: e?.message || 'Auto-publish crashed' }] }
    }
  }

  return NextResponse.json({ ok: true, campaign: cleanDestination(data), autoPublish })
}
