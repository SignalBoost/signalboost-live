// saas/app/api/cos/video-pipeline-xray/route.ts
// Owner-only, zero-cost pipeline X-ray. Open in the browser while logged in:
//
//   /api/cos/video-pipeline-xray            → full state, no changes
//   /api/cos/video-pipeline-xray?kick=1     → also force-start renders NOW for
//                                             campaigns with no video, and
//                                             report every error verbatim
//   /api/cos/video-pipeline-xray?reset=ID   → wipe broken video metadata from
//                                             one campaign so Stage 0 re-renders
//                                             it from scratch on the next tick
//
// Shows for the last 15 video campaigns: exact stage, stored errors, render
// handle, which languages are voiced/branded, and WHY each one is (or isn't)
// eligible for the auto-render, voice, and banner stages.

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

function previewUrl(v: any): string | null {
  if (!v) return null
  if (v.branded === true && v.voicedUrl) return String(v.voicedUrl)
  if (v.voicedUrl) return String(v.voicedUrl)
  if (v.url) return String(v.url)
  return null
}

function minutesAgo(value: any): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  if (!Number.isFinite(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}

function keys(obj: any): string[] {
  return obj && typeof obj === 'object' ? Object.keys(obj) : []
}

function brandingDiagnostics(c: any): string {
  const v = c?.metadata?.video
  if (!v) return 'BRANDING: no video metadata yet'

  const langs = Array.isArray(c.languages) && c.languages.length ? c.languages.filter(Boolean) : ['en']
  const primary = langs[0] || 'en'
  const unbranded = keys(v.unbrandedVoiced)
  const branded = keys(v.brandedLangs).filter((lang) => Boolean((v.brandedLangs || {})[lang]))
  const attempts = v.ghOverlayAttempts || {}
  const attemptSummary = langs.map((lang: string) => `${lang}:${Number(attempts[lang] || 0)}/${MAX_OVERLAY_ATTEMPTS}`).join(', ')
  const lock = v.brandingLock || null
  const lockAge = lock?.at ? minutesAgo(lock.at) : null
  const overlayError = String(v.voiceError || '').toLowerCase().includes('ffmpeg overlay') || String(v.voiceError || '').toLowerCase().includes('storage upload') || String(v.voiceError || '').toLowerCase().includes('download failed')

  if (v.branded === true && v.voicedUrl) return `BRANDING DONE: primary ${primary} final URL exists; branded languages: [${branded.join(',') || 'none'}]`
  if (v.brandingExhausted === true) return `BRANDING EXHAUSTED: GitHub FFmpeg overlay attempts reached limit. Attempts: ${attemptSummary}. Last error: ${String(v.voiceError || 'none').slice(0, 180)}`
  if (overlayError) return `BANNER ISSUE: GitHub FFmpeg overlay failed. Attempts: ${attemptSummary}. Last error: ${String(v.voiceError || '').slice(0, 220)}`
  if (lock && lockAge !== null) return `BANNER LOCK: GitHub FFmpeg worker claimed ${String(lock.lang || 'unknown')} about ${lockAge} min ago. If this stays over 10 min, the workflow may have died mid-run.`
  if (unbranded.length) return `BANNER WAITING: voiced/unbranded languages [${unbranded.join(',')}] are ready. GitHub Actions FFmpeg worker must burn the SignalBoostAi banner. Attempts: ${attemptSummary}.`
  if (v.status === 'ready' && v.url && !unbranded.length && !branded.length) return 'BRANDING NOT READY: base video is ready but no unbranded voiced language exists yet; voice stage must create unbrandedVoiced first.'
  return `BRANDING PENDING: status=${String(v.status || 'unknown')}; branded=[${branded.join(',') || 'none'}]; attempts=${attemptSummary}`
}

function eligibility(c: any): string {
  const v = c?.metadata?.video
  const created = c.created_at ? Date.parse(c.created_at) : 0
  if (!created || created < Date.parse(BACKLOG_CUTOFF)) return 'BLOCKED: created before cutoff — set COS_BRAND_SINCE earlier or use ?reset after adjusting'
  if (c.status === 'rejected') return 'BLOCKED: campaign rejected'
  if (!v) return 'STAGE 0: waiting for auto-render start (next cron tick, or use ?kick=1)'
  if (v.status === 'rendering') {
    const age = v.started_at ? Math.round((Date.now() - Date.parse(v.started_at)) / 60000) : -1
    return age > 15
      ? `STUCK: rendering for ${age} min — render died or poll cron lost it. Use ?reset=${c.id} to re-render`
      : `RENDERING: render in progress (${age} min) — poll cron advances it`
  }
  if (v.status === 'failed') return `FAILED render: ${String(v.error || 'unknown').slice(0, 120)} — use ?reset=${c.id} to re-render`
  if (v.status === 'ready') {
    if (v.branded === true && v.voicedUrl) return 'DONE: branded video previewable — approve on the dashboard'
    const unb = keys(v.unbrandedVoiced)
    if (unb.length) return brandingDiagnostics(c)
    if (v.voiceError) return `VOICE ISSUE: ${String(v.voiceError).slice(0, 140)}`
    return 'VOICE STAGE: waiting for the voice cron (every 2 min)'
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
    if (!c) {
      actions.push({ action: 'reset', id: resetId, ok: false, error: 'campaign not found' })
    } else {
      const metadata = { ...(c.metadata || {}) }
      delete (metadata as any).video
      const { error } = await sb.from('cos_campaign_queue').update({ metadata }).eq('id', resetId)
      actions.push({ action: 'reset', id: resetId, ok: !error, error: error?.message || null, note: 'video metadata wiped — Stage 0 re-renders it on the next tick (or add ?kick=1 now)' })
    }
  }

  if (kick) {
    const { data: pending } = await sb
      .from('cos_campaign_queue')
      .select('*')
      .in('channel', VIDEO_CHANNELS)
      .gte('created_at', BACKLOG_CUTOFF)
      .neq('status', 'rejected')
      .is('metadata->video', null)
      .order('created_at', { ascending: false })
      .limit(3)
    if (!pending?.length) actions.push({ action: 'kick', ok: true, note: 'no campaigns eligible for render start (all have video metadata already — see eligibility per campaign below)' })
    for (const c of pending || []) {
      const aspect: '9:16' | '16:9' = c.channel === 'short_video' ? '9:16' : '16:9'
      const theme = String(c.title || c.objective || 'an AI platform that helps businesses grow').replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
      const prompt = `Cinematic promotional b-roll for a premium AI business platform. Theme: ${theme}. Modern professionals using sleek software dashboards, growth charts rising, AI automation and workflows, clean bright modern offices, confident entrepreneurs. Premium, optimistic, high-end tech commercial look, smooth cinematic camera motion. Absolutely no on-screen text, no words, no letters, no captions, no subtitles, no logos, no watermarks, no URLs, no signage.`.slice(0, 600)
      const kicked: any = await startSiteVideo(prompt, aspect)
      if (kicked?.ok) {
        await sb.from('cos_campaign_queue').update({
          metadata: { ...(c.metadata || {}), video: { status: 'rendering', requestId: kicked.requestId, model: kicked.model, aspect, prompt, started_at: new Date().toISOString(), auto_started: true, voicedUrl: null, voiced: {}, branded: false, brandSchemaVersion: null, brandText: null, brandedAt: null, voiceError: null, brandAttempts: {}, brandingLock: null } },
        }).eq('id', c.id)
      }
      actions.push({ action: 'kick', id: c.id, title: String(c.title || '').slice(0, 50), ok: Boolean(kicked?.ok), error: kicked?.ok ? null : String(kicked?.error || 'startSiteVideo failed') })
    }
  }

  const env = {
    FAL_KEY: Boolean(process.env.FAL_KEY),
    ELEVENLABS_API_KEY: Boolean(process.env.ELEVENLABS_API_KEY),
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    GITHUB_WRITE_TOKEN: Boolean(process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN),
    CRON_SECRET: Boolean(process.env['CRON_' + 'SECRET']),
    COS_BRAND_SINCE_override: process.env.COS_BRAND_SINCE || null,
  }

  const { data: recent } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .order('created_at', { ascending: false })
    .limit(15)

  const campaigns = (recent || []).map((c: any) => {
    const v = c?.metadata?.video || null
    const finalUrl = v?.branded === true && v?.voicedUrl ? String(v.voicedUrl) : null
    const baseUrl = v?.url ? String(v.url) : null
    const anyPreviewUrl = previewUrl(v)
    return {
      id: c.id,
      title: String(c.title || '').slice(0, 60),
      channel: c.channel,
      status: c.status,
      created_at: c.created_at,
      approved_at: c.approved_at || null,
      video: v
        ? {
            stage: v.status || null,
            requestId: v.requestId || null,
            started_at: v.started_at || null,
            hasKlingUrl: Boolean(v.url),
            baseUrl,
            finalUrl,
            previewUrl: anyPreviewUrl,
            previewKind: finalUrl ? 'branded final' : baseUrl ? 'base draft' : anyPreviewUrl ? 'video' : null,
            voicedLangs: keys(v.unbrandedVoiced),
            brandedLangs: keys(v.brandedLangs).filter((k: string) => (v.brandedLangs || {})[k]),
            branded: v.branded === true,
            previewable: Boolean(anyPreviewUrl),
            voiceError: v.voiceError || null,
            renderError: v.error || null,
            ghOverlayAttempts: v.ghOverlayAttempts || {},
            brandingLock: v.brandingLock || null,
            brandingExhausted: v.brandingExhausted === true,
            brandDebug: v.brandDebug || null,
            brandSchemaVersion: v.brandSchemaVersion || null,
            brandedAt: v.brandedAt || null,
            brandingDiagnostics: brandingDiagnostics(c),
            autoPublishNote: c?.metadata?.auto_publish_note || null,
          }
        : null,
      eligibility: eligibility(c),
    }
  })

  return NextResponse.json({ ok: true, now: new Date().toISOString(), backlogCutoff: BACKLOG_CUTOFF, env, actions, campaigns })
}
