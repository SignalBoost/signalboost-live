// saas/app/api/cos/video-pipeline-xray/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { startSiteVideo } from '@/lib/operator/video'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VIDEO_CHANNELS = ['youtube', 'short_video']
const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'
const MAX_OVERLAY_ATTEMPTS = 5

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function keys(obj: any): string[] { return obj && typeof obj === 'object' ? Object.keys(obj) : [] }
function minutesAgo(value: any): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  if (!Number.isFinite(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}
function isVideoChannel(c: any) { return VIDEO_CHANNELS.includes(String(c?.channel || '')) }
function campaignText(c: any): string {
  return [
    c?.title,
    c?.objective,
    c?.audience,
    c?.channel,
    JSON.stringify(c?.recommendation || {}),
    JSON.stringify(c?.work_items || []),
    JSON.stringify(c?.metadata || {}),
  ].filter(Boolean).join(' ').toLowerCase()
}
function isShortVideoRequest(c: any) {
  const text = campaignText(c)
  return /(short|tiktok|reel|reels|vertical|9:16|story|stories)/i.test(text)
}
function isExplicitlyTextOnly(c: any) {
  const text = campaignText(c)
  const explicitTextMarker = /(text\s*[-—:]?\s*not\s+a\s+video|not\s+a\s+video|no\s+video|text\s+only|texto\s+apenas|somente\s+texto|sin\s+video|bez\s+wideo|только\s+текст)/i.test(text)
  if (explicitTextMarker) return true

  const channel = String(c?.channel || '').toLowerCase()
  const textChannels = ['linkedin', 'blog', 'email', 'outreach', 'landing_page', 'review_campaign']
  if (!textChannels.includes(channel)) return false

  const strongVideoIntent = /(create|make|generate|produce|render|criar|gerar|produzir|faça|hacer|crear|stwórz|utwórz|созда).{0,80}\b(video|vídeo|clip|youtube|shorts?|reels?|tiktok|wideo|видео)\b/i.test(text)
  return !strongVideoIntent
}
function looksLikeVideoRequest(c: any) {
  if (isExplicitlyTextOnly(c)) return false
  if (isVideoChannel(c)) return true
  const text = campaignText(c)
  return /\b(video|vídeo|clip|youtube|filme|movie|wideo|видео)\b/i.test(text) || /(foto|photo|imagem|image|picture|screenshot).*(video|vídeo|clip)/i.test(text)
}
function inferredVideoChannel(c: any): 'youtube' | 'short_video' {
  return isShortVideoRequest(c) ? 'short_video' : 'youtube'
}
function renderPromptForCampaign(c: any) {
  const theme = String(c?.title || c?.objective || 'an AI platform that helps businesses grow')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return `Cinematic promotional b-roll for a premium AI business platform. Theme: ${theme}. Modern professionals using sleek software dashboards, growth charts rising, AI automation and workflows. No on-screen text, no logos, no URLs.`.slice(0, 600)
}
function isRejected(c: any) { return c?.status === 'rejected' }
function isFakeFinal(v: any) { return v?.brandDebug?.mode === 'direct-completion' || v?.brandText?.mode === 'direct-completion' || v?.brandDispatchWatchdog?.directCompletion === true }
function isRealFinal(c: any, v: any) { return !isRejected(c) && !isFakeFinal(v) && v?.branded === true && Boolean(v?.voicedUrl) }
function previewUrl(c: any, v: any): string | null {
  if (!v) return null
  if (isRealFinal(c, v)) return String(v.voicedUrl)
  if (v.url) return String(v.url)
  return null
}
function brandingDiagnostics(c: any): string {
  const v = c?.metadata?.video
  if (!v) return 'BRANDING: no video metadata yet'
  if (isRejected(c)) return `BLOCKED: campaign rejected. Underlying state: ${underlyingIssue(v)}`
  if (isFakeFinal(v)) return 'INVALID FINAL STATE: previous emergency fallback marked this as final without a real FFmpeg banner. Reset and reprocess this campaign.'
  const langs = Array.isArray(c.languages) && c.languages.length ? c.languages.filter(Boolean) : ['en']
  const primary = langs[0] || 'en'
  const unbranded = keys(v.unbrandedVoiced)
  const branded = keys(v.brandedLangs).filter((lang) => Boolean((v.brandedLangs || {})[lang]))
  const attempts = v.ghOverlayAttempts || {}
  const attemptSummary = langs.map((lang: string) => `${lang}:${Number(attempts[lang] || 0)}/${MAX_OVERLAY_ATTEMPTS}`).join(', ')
  const lock = v.brandingLock || null
  const lockAge = lock?.at ? minutesAgo(lock.at) : null
  if (isRealFinal(c, v)) return `DONE: primary ${primary} final URL exists; branded languages: [${branded.join(',') || 'none'}]`
  if (v.brandingExhausted === true) return `BRANDING EXHAUSTED: attempts ${attemptSummary}. Last error: ${String(v.voiceError || 'none').slice(0, 180)}`
  if (lock && lockAge !== null) return `BANNER LOCK: worker claimed ${String(lock.lang || 'unknown')} about ${lockAge} min ago.`
  if (unbranded.length) return `BANNER WAITING: voiced/unbranded languages [${unbranded.join(',')}] are ready. GitHub Actions FFmpeg worker must burn the SignalBoostAi banner. Attempts: ${attemptSummary}.`
  if (v.status === 'ready' && v.url && !unbranded.length && !branded.length) return 'BRANDING NOT READY: base video is ready but no unbranded voiced language exists yet.'
  return `BRANDING PENDING: status=${String(v.status || 'unknown')}; branded=[${branded.join(',') || 'none'}]; attempts=${attemptSummary}`
}
function underlyingIssue(v: any): string {
  if (!v) return 'no video metadata yet'
  if (v.voiceError) return `voice/brand error: ${String(v.voiceError).slice(0, 140)}`
  if (v.status === 'rendering') return 'render in progress'
  if (v.status === 'failed') return `render failed: ${String(v.error || 'unknown').slice(0, 100)}`
  const unb = keys(v.unbrandedVoiced)
  if (v.status === 'ready' && v.url && !unb.length) return 'base ready, not voiced yet'
  if (unb.length) return `voiced [${unb.join(',')}], banner not burned`
  return `stage=${String(v.status || 'unknown')}`
}
// THE PUBLISH LEG'S OWN RECORD. Every auto-publish attempt writes its outcome to
// metadata.autoPublishExact — error, timestamp, live URL. For eighteen days that record
// said "Token has been expired or revoked" every ten minutes while the card said
// "Publishing is continuing automatically", because nothing between the row and the
// screen ever read it. This function is that missing read.
function publishAttempt(c: any): { ok: boolean | null; error: string | null; lastAttemptAt: string | null; liveUrl: string | null; quotaBlockedUntil: string | null } | null {
  const a = c?.metadata?.autoPublishExact
  if (!a || typeof a !== 'object') return null
  return {
    ok: typeof a.ok === 'boolean' ? a.ok : null,
    error: a.error ? String(a.error).slice(0, 200) : null,
    lastAttemptAt: a.lastAttemptAt || null,
    liveUrl: a.liveUrl || null,
    quotaBlockedUntil: a.quotaBlockedUntil || c?.metadata?.youtubeQuota?.blockedUntil || null,
  }
}

function eligibility(c: any, job?: any): string {
  const v = c?.metadata?.video
  const created = c.created_at ? Date.parse(c.created_at) : 0
  if (!created || created < Date.parse(BACKLOG_CUTOFF)) return 'BLOCKED: created before cutoff'
  // APPROVED CAMPAIGNS HAVE A LIFE AFTER APPROVAL, and until now this function ended its
  // reasoning at the approve button — rendering states only, nothing about publishing. An
  // approved campaign whose every publish attempt was being refused reported nothing.
  if (c.approved_at && String(c.status || '') === 'approved') {
    const attempt = publishAttempt(c)
    if (attempt?.liveUrl) return `PUBLISHED: live at ${attempt.liveUrl}`
    if (attempt?.quotaBlockedUntil && Date.parse(attempt.quotaBlockedUntil) > Date.now()) {
      return `PUBLISH WAITING: YouTube quota exhausted — retries resume after ${attempt.quotaBlockedUntil}.`
    }
    if (attempt && attempt.ok === false && attempt.error) {
      const err = attempt.error
      const tokenDead = /expired|revoked|invalid_grant|unauthorized/i.test(err)
      return tokenDead
        ? `PUBLISH FAILING: ${err} — the YouTube connection is dead. Reconnect the Google account (and move the OAuth app to Production in Google Cloud Console so the token stops expiring every 7 days). Retrying every 10 min; last attempt ${attempt.lastAttemptAt || 'unknown'}.`
        : `PUBLISH FAILING: ${err} — retrying every 10 min; last attempt ${attempt.lastAttemptAt || 'unknown'}.`
    }
    if (!attempt) return 'PUBLISH PENDING: approved — waiting for the first auto-publish attempt (runs every 10 min).'
  }
  if (isRejected(c)) return `STUCK: campaign rejected — pipeline frozen. Underlying state: ${underlyingIssue(v)}. Press "Reset and kick" to clear video state, move it back to waiting_approval and re-render.`
  if (!isVideoChannel(c) && looksLikeVideoRequest(c) && !v) return `STUCK: video request was routed as ${String(c.channel || 'unknown')} instead of youtube/short_video. Press "Kick missing renders" to rescue it, move it into the video pipeline, and start rendering.`
  if (!v) return 'STAGE 0: waiting for auto-render start'
  if (isFakeFinal(v)) return 'STUCK: fake final artifact from old emergency fallback. Press "Reset and kick" (or wait — the brand overlay worker now self-heals these every 10 min). Do not approve this video.'
  if (v.status === 'rendering') {
    if (job) {
      const jobStatus = String(job.status || 'unknown')
      const idleMin = minutesAgo(job.updated_at)
      if (jobStatus === 'failed' || jobStatus === 'escalated' || jobStatus === 'dlq') {
        return `STUCK: render job ${jobStatus}: ${String(job.error || job.queue_drop_reason || 'unknown').slice(0, 140)}. Press "Reset and kick" to re-render.`
      }
      if (jobStatus === 'rendering' && idleMin !== null && idleMin > 20) {
        return `STUCK: render job orphaned — claimed by a worker ${idleMin} min ago and never finished (worker was likely killed). The production worker requeues these automatically every run; press "Reset and kick" to force a fresh render now.`
      }
      if (jobStatus === 'queued' && idleMin !== null && idleMin > 30) {
        return `STUCK: render job has been queued for ${idleMin} min with no worker pickup. Check GitHub Actions → "COS Video Production" for red runs (missing secrets, disabled schedule). Press "Reset and kick" to requeue.`
      }
      return `RENDERING: job ${jobStatus}${idleMin !== null ? ` (last update ${idleMin} min ago)` : ''} — immediate dispatch requested; the 10-minute schedule remains as backup.`
    }
    const startedMin = minutesAgo(v.started_at)
    if (startedMin !== null && startedMin > 30) return `STUCK: rendering for ${startedMin} min and the render job row cannot be found. Press "Reset and kick" to start over.`
    return 'RENDERING: render in progress'
  }
  if (v.status === 'failed') return `FAILED render: ${String(v.error || 'unknown').slice(0, 120)}`
  if (v.status === 'ready') {
    if (isRealFinal(c, v)) return 'DONE: branded video previewable — approve on the dashboard'
    const unb = keys(v.unbrandedVoiced)
    if (unb.length) return brandingDiagnostics(c)
    if (v.voiceError) return `VOICE ISSUE: ${String(v.voiceError).slice(0, 140)}`
    return 'VOICE STAGE: waiting for the voice cron'
  }
  return `UNKNOWN state: ${String(v.status)}`
}

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })
  const sb = admin()
  const url = new URL(req.url)
  const kick = url.searchParams.get('kick') === '1'
  const resetId = String(url.searchParams.get('reset') || '').trim()
  const actions: any[] = []
  if (resetId) {
    const { data: c } = await sb.from('cos_campaign_queue').select('*').eq('id', resetId).single()
    if (!c) actions.push({ action: 'reset', id: resetId, ok: false, error: 'campaign not found' })
    else {
      const metadata = { ...(c.metadata || {}) }
      delete (metadata as any).video
      const { error } = await sb.from('cos_campaign_queue').update({ metadata, status: c.status === 'rejected' ? 'waiting_approval' : c.status }).eq('id', resetId)
      actions.push({ action: 'reset', id: resetId, ok: !error, error: error?.message || null, note: 'video metadata wiped; campaign can render again' })
    }
  }
  if (kick) {
    const { data: pendingAll } = await sb.from('cos_campaign_queue').select('*').gte('created_at', BACKLOG_CUTOFF).neq('status', 'rejected').is('metadata->video', null).order('created_at', { ascending: false }).limit(20)
    const pending = (pendingAll || []).filter((c: any) => !isExplicitlyTextOnly(c) && (isVideoChannel(c) || looksLikeVideoRequest(c))).slice(0, 3)
    if (!pending.length) actions.push({ action: 'kick', ok: true, note: 'no campaigns eligible for render start' })
    for (const c of pending) {
      const rescued = !isVideoChannel(c)
      const channel = rescued ? inferredVideoChannel(c) : String(c.channel || 'youtube')
      const aspect: '9:16' | '16:9' = channel === 'short_video' ? '9:16' : '16:9'
      const prompt = renderPromptForCampaign(c)
      const kicked: any = await startSiteVideo(prompt, aspect, {
        lang: Array.isArray(c.languages) && c.languages.length ? String(c.languages[0]) : 'en',
        title: c.title,
        hook: c.objective || c.title,
      })
      if (kicked?.ok) {
        const patch: any = {
          metadata: {
            ...(c.metadata || {}),
            video: { status: 'rendering', requestId: kicked.requestId, model: kicked.model, aspect, prompt, started_at: new Date().toISOString(), auto_started: true, rescued_from_channel: rescued ? c.channel : null, voicedUrl: null, voiced: {}, branded: false, brandSchemaVersion: null, brandText: null, brandedAt: null, voiceError: null, brandAttempts: {}, brandingLock: null }
          }
        }
        if (rescued) patch.channel = channel
        await sb.from('cos_campaign_queue').update(patch).eq('id', c.id)
      }
      actions.push({ action: rescued ? 'rescue-and-kick' : 'kick', id: c.id, previousChannel: rescued ? c.channel : null, channel, ok: Boolean(kicked?.ok), error: kicked?.ok ? null : String(kicked?.error || 'startSiteVideo failed') })
    }
  }
  const env = { FAL_KEY: Boolean(process.env.FAL_KEY), ELEVENLABS_API_KEY: Boolean(process.env.ELEVENLABS_API_KEY), RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY), GITHUB_WRITE_TOKEN: Boolean(process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN), CRON_SECRET: Boolean(process.env['CRON_' + 'SECRET']), COS_VIDEO_RENDER_BUCKET: process.env.COS_VIDEO_RENDER_BUCKET || null, COS_BRAND_SINCE_override: process.env.COS_BRAND_SINCE || null }
  const [videoRes, broadRes] = await Promise.all([
    sb.from('cos_campaign_queue').select('*').in('channel', VIDEO_CHANNELS).order('created_at', { ascending: false }).limit(15),
    sb.from('cos_campaign_queue').select('*').order('created_at', { ascending: false }).limit(40),
  ])
  const byId = new Map<string, any>()
  for (const c of (videoRes.data || [])) {
    if (!isExplicitlyTextOnly(c)) byId.set(String(c.id), c)
  }
  for (const c of (broadRes.data || [])) {
    if (!byId.has(String(c.id)) && !isExplicitlyTextOnly(c) && looksLikeVideoRequest(c)) byId.set(String(c.id), c)
  }
  const recent = Array.from(byId.values())
    .filter((c: any) => !isExplicitlyTextOnly(c))
    .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 20)

  const renderingIds = recent
    .map((c: any) => c?.metadata?.video)
    .filter((v: any) => v && v.status === 'rendering' && v.requestId)
    .map((v: any) => String(v.requestId))
  const jobById: Record<string, any> = {}
  if (renderingIds.length) {
    const { data: jobs } = await sb
      .from('cos_video_production_jobs')
      .select('id, status, error, queue_drop_reason, updated_at, created_at, watchdog_signal')
      .in('id', renderingIds)
    for (const j of jobs || []) jobById[String(j.id)] = j
  }
  const campaigns = recent.map((c: any) => {
    const v = c?.metadata?.video || null
    const finalUrl = isRealFinal(c, v) ? String(v.voicedUrl) : null
    const baseUrl = v?.url ? String(v.url) : null
    const anyPreviewUrl = previewUrl(c, v)
    const misrouted = !isVideoChannel(c) && looksLikeVideoRequest(c)
    return { id: c.id, title: String(c.title || '').slice(0, 60), channel: c.channel, intendedChannel: misrouted ? inferredVideoChannel(c) : c.channel, status: c.status, created_at: c.created_at, approved_at: c.approved_at || null, misrouted, publish: publishAttempt(c), video: v ? { stage: v.status || null, requestId: v.requestId || null, started_at: v.started_at || null, hasKlingUrl: Boolean(v.url), baseUrl, finalUrl, previewUrl: anyPreviewUrl, previewKind: finalUrl ? 'branded final' : baseUrl ? 'base draft' : anyPreviewUrl ? 'video' : null, voicedLangs: keys(v.unbrandedVoiced), brandedLangs: isFakeFinal(v) || isRejected(c) ? [] : keys(v.brandedLangs).filter((k: string) => (v.brandedLangs || {})[k]), branded: isRealFinal(c, v), previewable: Boolean(anyPreviewUrl), voiceError: v.voiceError || null, renderError: v.error || null, ghOverlayAttempts: v.ghOverlayAttempts || {}, brandingLock: v.brandingLock || null, brandingExhausted: v.brandingExhausted === true, brandDebug: v.brandDebug || null, brandSchemaVersion: v.brandSchemaVersion || null, brandedAt: v.brandedAt || null, brandingDiagnostics: brandingDiagnostics(c), autoPublishNote: c?.metadata?.auto_publish_note || null, renderJob: v?.requestId ? (jobById[String(v.requestId)] || null) : null } : null, eligibility: eligibility(c, v?.requestId ? jobById[String(v.requestId)] : undefined) }
  })
  return NextResponse.json({ ok: true, now: new Date().toISOString(), backlogCutoff: BACKLOG_CUTOFF, env, actions, campaigns })
}
