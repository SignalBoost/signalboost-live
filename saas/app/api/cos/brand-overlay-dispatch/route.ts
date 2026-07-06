import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { bannerAssetPath, firstBrandJob, runLocalBrandOverlay } from '@/lib/cos/local-brand-overlay'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OWNER = 'SignalBoost'
const REPO = 'signalboost-live'
const WORKFLOW_FILE = 'brand-overlay.yml'
const VIDEO_CHANNELS = ['youtube', 'short_video']
const MAX_ATTEMPTS = 5
const DISPATCH_TIMEOUT_MS = 5_000

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function keys(obj: any): string[] { return obj && typeof obj === 'object' ? Object.keys(obj) : [] }
function unbrandedLangs(video: any): string[] {
  const unbranded = video?.unbrandedVoiced || {}
  return keys(unbranded).filter((lang) => Boolean(unbranded[lang]))
}
function isWaitingForBrand(campaign: any): boolean {
  const video = campaign?.metadata?.video || null
  if (!video || video.status !== 'ready') return false
  if (video.branded === true && video.voicedUrl && video.brandDebug?.mode !== 'direct-completion') return false
  const waiting = unbrandedLangs(video)
  const attempts = video.ghOverlayAttempts || {}
  return waiting.some((lang) => Number(attempts[lang] || 0) < MAX_ATTEMPTS)
}

async function dispatchWorkflow(token: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.status === 204) return { ok: true, status: res.status, error: null }
    const error = (await res.text()).slice(0, 700)
    console.error('brand overlay dispatch failed', { status: res.status, error })
    return { ok: false, status: res.status, error }
  } catch (error) {
    clearTimeout(timer)
    const message = error instanceof Error ? error.message : 'dispatch failed'
    console.error('brand overlay dispatch exception', { message })
    return { ok: false, status: 0, error: message }
  }
}

async function markDispatchError(sb: any, campaigns: any[], reason: string) {
  const now = new Date().toISOString()
  const marked: any[] = []
  for (const campaign of campaigns) {
    const video = campaign?.metadata?.video || {}
    const { error } = await sb.from('cos_campaign_queue').update({
      metadata: {
        ...(campaign.metadata || {}),
        video: {
          ...video,
          brandingLock: null,
          branded: video.brandDebug?.mode === 'direct-completion' ? false : video.branded === true,
          brandedLangs: video.brandDebug?.mode === 'direct-completion' ? {} : video.brandedLangs || {},
          voicedUrl: video.brandDebug?.mode === 'direct-completion' ? null : video.voicedUrl || null,
          brandDebug: { ...(video.brandDebug || {}), fakeFinalRemovedAt: now, lastDispatchError: reason },
          brandDispatchWatchdog: { at: now, ok: false, reason, note: 'No fake finalization applied. Waiting for real FFmpeg banner worker.' },
        },
      },
    }).eq('id', campaign.id)
    marked.push({ id: campaign.id, ok: !error, error: error?.message || null })
  }
  return marked
}


async function primeFirstAttempts(sb: any, campaigns: any[]) {
  const now = new Date().toISOString()
  const primed: any[] = []
  for (const campaign of campaigns) {
    const video = campaign?.metadata?.video || {}
    const job = firstBrandJob(campaign)
    if (!job) continue
    const ghOverlayAttempts = { ...(video.ghOverlayAttempts || {}), [job.lang]: Math.max(1, Number(video.ghOverlayAttempts?.[job.lang] || 0)) }
    const patch = {
      ...video,
      ghOverlayAttempts,
      brandAttempts: { ...(video.brandAttempts || {}), [job.lang]: Math.max(1, Number(video.brandAttempts?.[job.lang] || 0)) },
      brandingLock: null,
      brandingExhausted: false,
      voiceError: null,
      brandDispatchWatchdog: { at: now, ok: null, note: `Attempts: ${job.lang}/1/${MAX_ATTEMPTS}; dispatch initialized by Kick branding worker.` },
    }
    const { error } = await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: patch } }).eq('id', campaign.id)
    if (!error) {
      campaign.metadata = { ...(campaign.metadata || {}), video: patch }
      primed.push({ id: campaign.id, lang: job.lang, attempts: `pt/1/${MAX_ATTEMPTS}` })
    } else {
      primed.push({ id: campaign.id, lang: job.lang, error: error.message })
    }
  }
  return primed
}

async function runEmergencyLocal(sb: any, campaigns: any[], reason: string) {
  const results: any[] = []
  for (const campaign of campaigns.slice(0, 1)) {
    const video = campaign?.metadata?.video || {}
    const job = firstBrandJob(campaign)
    if (!job) { results.push({ id: campaign.id, ok: false, error: 'No unbranded voiced job found.' }); continue }
    const aspect: '16:9' | '9:16' = video.aspect === '9:16' || video.aspect === '16:9' ? video.aspect : (campaign.channel === 'short_video' ? '9:16' : '16:9')
    try {
      const rendered = await runLocalBrandOverlay({ campaign, lang: job.lang, sourceUrl: job.sourceUrl, aspect })
      results.push({ id: campaign.id, lang: job.lang, ok: true, reason, ...rendered })
    } catch (e: any) {
      const message = e?.message || 'local FFmpeg fallback failed'
      await markDispatchError(sb, [campaign], `${reason}; local fallback failed: ${message}`)
      results.push({ id: campaign.id, lang: job.lang, ok: false, reason, error: message, bannerAssetPath: bannerAssetPath() })
    }
  }
  return results
}

async function handle(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })
  const sb = admin()
  const { data: recent, error } = await sb.from('cos_campaign_queue').select('*').in('channel', VIDEO_CHANNELS).neq('status', 'rejected').order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const candidates = (recent || []).filter(isWaitingForBrand)
  const force = new URL(req.url).searchParams.get('force') === '1'
  if (!candidates.length && !force) return NextResponse.json({ ok: true, dispatched: false, reason: 'No banner-waiting campaigns found.', waitingCount: 0 })
  const primed = await primeFirstAttempts(sb, candidates)
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    const local = await runEmergencyLocal(sb, candidates, 'missing GitHub Actions token')
    return NextResponse.json({ ok: local.some((r) => r.ok), dispatched: false, waitingCount: candidates.length, primed, local, error: 'Missing GitHub token; emergency local FFmpeg fallback attempted.' }, { status: local.some((r) => r.ok) ? 200 : 500 })
  }
  const dispatched = await dispatchWorkflow(token)
  if (!dispatched.ok) {
    const reason = `workflow dispatch failed or timed out within ${DISPATCH_TIMEOUT_MS}ms: ${dispatched.error || dispatched.status}`
    const local = await runEmergencyLocal(sb, candidates, reason)
    return NextResponse.json({ ok: local.some((r) => r.ok), dispatched: false, dispatch: dispatched, waitingCount: candidates.length, primed, local }, { status: local.some((r) => r.ok) ? 200 : 502 })
  }
  return NextResponse.json({ ok: true, dispatched: true, status: dispatched.status, waitingCount: candidates.length, primed })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
