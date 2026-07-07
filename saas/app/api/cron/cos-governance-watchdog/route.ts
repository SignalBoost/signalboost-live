import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { startSiteVideo, fetchSiteVideo } from '@/lib/operator/video'
import { proposeInfrastructurePr } from '@/lib/infra-pr/tool'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const VIDEO_CHANNELS = ['youtube', 'short_video']
const WORKFLOW_FILE = 'brand-overlay.yml'
const RENDER_STALE_MINUTES = 45
const RENDER_RESTART_MINUTES = 90
const MISSING_RENDER_MINUTES = 5
const MAX_RESTARTS_BEFORE_THROTTLE = 5
const MAX_PER_RUN = 6
const OWNER_EMAIL = 'cos-governance-watchdog@signalboost.internal'

function isCronRequest(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  return Boolean(secret && auth === `Bearer ${secret}`)
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

function now() { return new Date().toISOString() }
function ageMinutes(value: any): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  if (!Number.isFinite(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}
function keys(obj: any): string[] { return obj && typeof obj === 'object' ? Object.keys(obj) : [] }
function video(campaign: any) { return campaign?.metadata?.video || null }
function isVideoCampaign(campaign: any) { return VIDEO_CHANNELS.includes(String(campaign?.channel || '')) }
function restartCount(campaign: any) { return Number(video(campaign)?.governanceRestartCount || 0) }
function aspectFor(campaign: any): '16:9' | '9:16' { return String(campaign?.channel) === 'short_video' ? '9:16' : '16:9' }
function lifeCriticalText(value: any): boolean {
  const t = JSON.stringify(value || {}).toLowerCase()
  return ['life-critical', 'life critical', 'life and death', 'medical device', 'patient safety', 'aviation fuel', 'aircraft safety', 'hospital emergency', 'nuclear', 'radiological', 'human safety', 'safety critical'].some(word => t.includes(word))
}
function promptFor(campaign: any) {
  const existing = String(video(campaign)?.prompt || '').trim()
  if (existing) return existing.slice(0, 900)
  const theme = [campaign?.title, campaign?.objective, campaign?.audience].filter(Boolean).join(' ').replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)
  return `Cinematic promotional b-roll for a premium AI business platform. Theme: ${theme || 'SignalBoostAi business growth campaign'}. Modern professionals using software dashboards, growth charts rising, AI automation workflows. No text, no logos, no URLs.`.slice(0, 900)
}
function waitingLangs(v: any): string[] {
  const unbranded = v?.unbrandedVoiced || {}
  const branded = v?.brandedLangs || {}
  const attempts = v?.ghOverlayAttempts || {}
  return keys(unbranded).filter(lang => unbranded[lang] && !branded[lang] && Number(attempts[lang] || 0) < 5)
}
function isWaitingForBrand(campaign: any) {
  const v = video(campaign)
  if (!v || v.status !== 'ready') return false
  if (v.branded === true && v.voicedUrl) return false
  return waitingLangs(v).length > 0
}
function eventId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

async function logDecision(sb: any, objective: string, state: string, status: string, payload: any) {
  const at = now()
  const lifeCritical = lifeCriticalText(payload)
  await sb.from('cos_decisions').insert({
    decision_id: eventId('gov_watchdog'),
    user_id: null,
    objective,
    channel: 'cos_governance',
    state,
    required_source: 'cron_cos_governance_watchdog',
    must_use_tool: true,
    proposes_action: true,
    required_approval: lifeCritical,
    approval_reasons: [`pipeline=${payload?.pipeline || 'primary'}`, `risk=${payload?.riskLevel || 'medium'}`, `lifeCritical=${lifeCritical}`],
    confidence: status === 'executed' ? 92 : 78,
    output: { report: objective, governance: { ...payload, lifeCritical, autonomous: !lifeCritical } },
    status,
    created_at: at,
  })
}

async function createLifeCriticalEscalation(reason: string, payload: any) {
  if (!lifeCriticalText({ reason, payload })) return { ok: true, skipped: true, reason: 'not_life_critical_autonomous_resolution_continues' }
  return proposeInfrastructurePr({
    provider: 'cos_governance',
    actionId: 'create_life_critical_escalation_ticket',
    verb: 'create',
    title: reason.slice(0, 140),
    description: `24x7 COS governance watchdog escalated a life-critical condition. ${reason}`,
    payload: { ...payload, status: 'pending_human_review', source: 'cos-governance-watchdog', fallbackAlternatives: ['hold action', 'notify responsible human', 'keep system in safest state'], createdAt: now() },
  }, { userId: null, role: 'owner' })
}

async function dispatchBrandOverlay() {
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) return { ok: false, status: 0, error: 'Missing GitHub token for brand overlay dispatch.' }
  const res = await fetch('https://api.github.com/repos/SignalBoost/signalboost-live/actions/workflows/brand-overlay.yml/dispatches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
    cache: 'no-store',
  })
  if (res.status === 204) return { ok: true, status: 204, error: null }
  return { ok: false, status: res.status, error: (await res.text()).slice(0, 700) }
}

async function throttleNonLifeCritical(sb: any, campaign: any, reason: string) {
  const v = video(campaign) || {}
  const payload = { action: 'autonomous_throttle_after_restart_limit', pipeline: 'backup', riskLevel: 'medium', campaignId: campaign.id, reason, restartCount: restartCount(campaign) }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, governanceThrottle: { at: now(), reason, mode: 'autonomous_retry_backoff', nextWatchdogWillReassess: true } } } }).eq('id', campaign.id)
  await logDecision(sb, `Autonomous throttle/backoff for ${campaign.title || campaign.id}`, 'EXECUTE', 'executed', payload)
  return { action: 'autonomous_throttle_backoff', id: campaign.id, ok: true, payload }
}

async function startOrRestartRender(sb: any, campaign: any, reason: string) {
  const count = restartCount(campaign)
  if (count >= MAX_RESTARTS_BEFORE_THROTTLE) {
    if (lifeCriticalText(campaign)) {
      const pr = await createLifeCriticalEscalation(`Life-critical render restart limit reached for ${campaign.id}`, { pipeline: 'primary', riskLevel: 'critical', reason, campaignId: campaign.id, title: campaign.title, video: video(campaign), restartCount: count })
      await logDecision(sb, `Life-critical escalation for render restart limit ${campaign.title || campaign.id}`, 'PREPARE_AND_HOLD', 'logged', { action: 'life_critical_escalate', pipeline: 'primary', riskLevel: 'critical', campaignId: campaign.id, prCockpit: pr })
      return { action: 'life_critical_escalation', id: campaign.id, ok: pr.ok, pr }
    }
    return throttleNonLifeCritical(sb, campaign, reason)
  }

  const started = await startSiteVideo(promptFor(campaign), aspectFor(campaign))
  const at = now()
  const previousVideo = video(campaign)

  if (started.ok === false) {
    const nextVideo = { ...(previousVideo || {}), status: 'failed', error: started.error, failed_at: at, governanceRestartCount: count + 1, governanceReason: reason }
    await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: nextVideo } }).eq('id', campaign.id)
    await logDecision(sb, `Failed to restart COSA render for ${campaign.title || campaign.id}`, 'EXECUTE', 'executed', { action: 'auto_apply', pipeline: 'backup', riskLevel: 'high', campaignId: campaign.id, reason, started, fallback: 'watchdog_will_retry_without_human' })
    return { action: 'restart_render_failed_will_retry', id: campaign.id, ok: false, error: started.error, autonomous: true }
  }

  const nextVideo = { status: 'rendering', requestId: started.requestId, model: started.model, aspect: aspectFor(campaign), prompt: promptFor(campaign), started_at: at, auto_started: true, governanceRestartCount: count + 1, governanceReason: reason, providerFallback: (started as any).fallbackFrom || null, providerWarning: (started as any).warning || null, previousVideo, voicedUrl: null, voiced: {}, branded: false, brandedLangs: {}, unbrandedVoiced: {}, brandAttempts: {}, ghOverlayAttempts: {}, brandingLock: null }
  await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: nextVideo } }).eq('id', campaign.id)
  await logDecision(sb, `Auto-restarted COSA render for ${campaign.title || campaign.id}`, 'EXECUTE', 'executed', { action: 'auto_apply', pipeline: 'primary', riskLevel: 'medium', campaignId: campaign.id, reason, started, fallback: 'render_started' })
  return { action: 'restart_render', id: campaign.id, ok: true, requestId: started.requestId, fallbackFrom: (started as any).fallbackFrom || null }
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const sb = db()
  const report: any = { ok: true, at: now(), monitor: 'cos-governance-watchdog', mode: 'autonomous_except_life_critical', actions: [], escalations: [], scanned: 0 }
  const { data: recent, error } = await sb.from('cos_campaign_queue').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const campaigns = recent || []
  report.scanned = campaigns.length
  const videoCampaigns = campaigns.filter(isVideoCampaign).filter((c: any) => c.status !== 'rejected')
  const missingRender = videoCampaigns.filter((c: any) => !video(c) && (ageMinutes(c.created_at) || 0) >= MISSING_RENDER_MINUTES).slice(0, MAX_PER_RUN)
  const failed = videoCampaigns.filter((c: any) => video(c)?.status === 'failed').slice(0, MAX_PER_RUN)
  const rendering = videoCampaigns.filter((c: any) => video(c)?.status === 'rendering').slice(0, MAX_PER_RUN)
  const waitingBrand = videoCampaigns.filter(isWaitingForBrand)

  for (const campaign of missingRender) report.actions.push(await startOrRestartRender(sb, campaign, 'missing_video_metadata_watchdog'))
  for (const campaign of failed) report.actions.push(await startOrRestartRender(sb, campaign, 'failed_render_watchdog'))

  for (const campaign of rendering) {
    const v = video(campaign)
    const age = ageMinutes(v?.started_at || campaign.created_at) || 0
    if (v?.requestId && v?.model) {
      const polled = await fetchSiteVideo(v.requestId, v.model).catch((e: any) => ({ status: 'failed', error: e?.message || 'poll failed' }))
      if (polled.status === 'done' && (polled as any).videoUrl) {
        await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'ready', url: (polled as any).videoUrl, ready_at: now(), governancePoll: { at: now(), by: OWNER_EMAIL } } } }).eq('id', campaign.id)
        report.actions.push({ action: 'advanced_render_to_ready', id: campaign.id, ok: true })
        await logDecision(sb, `Advanced render to ready for ${campaign.title || campaign.id}`, 'EXECUTE', 'executed', { action: 'poll_render', pipeline: 'primary', riskLevel: 'low', campaignId: campaign.id })
      } else if (polled.status === 'failed') {
        await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'failed', error: (polled as any).error || 'render failed', failed_at: now(), governancePoll: { at: now(), by: OWNER_EMAIL } } } }).eq('id', campaign.id)
        report.actions.push(await startOrRestartRender(sb, { ...campaign, metadata: { ...(campaign.metadata || {}), video: { ...v, status: 'failed' } } }, 'poll_detected_failed_render'))
      } else if (age >= RENDER_RESTART_MINUTES) report.actions.push(await startOrRestartRender(sb, campaign, `stale_render_${age}_minutes`))
      else if (age >= RENDER_STALE_MINUTES) report.actions.push({ action: 'render_stale_watch', id: campaign.id, ok: true, ageMinutes: age })
    } else if (age >= RENDER_STALE_MINUTES) report.actions.push(await startOrRestartRender(sb, campaign, `rendering_missing_request_id_${age}_minutes`))
  }

  if (waitingBrand.length) {
    const dispatch = await dispatchBrandOverlay()
    report.actions.push({ action: 'dispatch_brand_overlay', ok: dispatch.ok, status: dispatch.status, waitingCount: waitingBrand.length, error: dispatch.error })
    for (const campaign of waitingBrand.slice(0, 25)) {
      const v = video(campaign) || {}
      await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...v, brandingLock: null, governanceBrandDispatch: { at: now(), ok: dispatch.ok, status: dispatch.status, error: dispatch.error, waitingLangs: waitingLangs(v), workflow: WORKFLOW_FILE, autonomous: true } } } }).eq('id', campaign.id)
    }
    await logDecision(sb, `${dispatch.ok ? 'Dispatched' : 'Failed to dispatch'} brand overlay workflow for ${waitingBrand.length} campaign(s)`, 'EXECUTE', 'executed', { action: 'dispatch_brand_overlay', pipeline: dispatch.ok ? 'primary' : 'backup', riskLevel: dispatch.ok ? 'medium' : 'high', dispatch, waitingCount: waitingBrand.length, fallback: dispatch.ok ? 'primary_worker' : 'watchdog_retry_next_cycle' })
    if (!dispatch.ok) {
      const lifeCriticalWaiting = waitingBrand.filter(lifeCriticalText)
      if (lifeCriticalWaiting.length) report.escalations.push(await createLifeCriticalEscalation('Life-critical brand overlay dispatch failed from watchdog', { pipeline: 'primary', riskLevel: 'critical', dispatch, waitingCampaigns: lifeCriticalWaiting.map((c: any) => c.id) }))
    }
  }

  report.summary = { missingRender: missingRender.length, failed: failed.length, rendering: rendering.length, waitingBrand: waitingBrand.length, actions: report.actions.length, escalations: report.escalations.length }
  return NextResponse.json(report)
}

export async function POST(req: NextRequest) { return GET(req) }
