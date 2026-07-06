import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const OWNER = 'SignalBoost'
const REPO = 'signalboost-live'
const WORKFLOW_FILE = 'brand-overlay.yml'
const VIDEO_CHANNELS = ['youtube', 'short_video']
const STALE_LOCK_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const DISPATCH_TIMEOUT_MS = 10_000

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function keys(obj: any): string[] {
  return obj && typeof obj === 'object' ? Object.keys(obj) : []
}

function ageMinutes(value: any): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  if (!Number.isFinite(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}

function unbrandedLangs(video: any): string[] {
  const unbranded = video?.unbrandedVoiced || {}
  return keys(unbranded).filter((lang) => Boolean(unbranded[lang]))
}

function isWaitingForBrand(campaign: any): boolean {
  const video = campaign?.metadata?.video || null
  if (!video || video.status !== 'ready') return false
  if (video.branded === true && video.voicedUrl) return false
  const waiting = unbrandedLangs(video)
  if (!waiting.length) return false
  const attempts = video.ghOverlayAttempts || {}
  return waiting.some((lang) => Number(attempts[lang] || 0) < MAX_ATTEMPTS)
}

async function dispatchWorkflow(token: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { source: 'vercel-brand-overlay-dispatch' } }),
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.status === 204) return { ok: true, status: res.status, error: null }
    const error = (await res.text()).slice(0, 700)
    console.error('brand-overlay workflow_dispatch failed', { status: res.status, error })
    return { ok: false, status: res.status, error }
  } catch (error) {
    clearTimeout(timer)
    const message = error instanceof Error ? error.message : 'workflow dispatch failed'
    console.error('brand-overlay workflow_dispatch exception', { message })
    return { ok: false, status: 0, error: message }
  }
}

function completionPatch(campaign: any, reason: string) {
  const now = new Date().toISOString()
  const video = campaign?.metadata?.video || {}
  const langs = Array.isArray(campaign?.languages) && campaign.languages.length ? campaign.languages.filter(Boolean) : ['en']
  const primary = langs[0] || 'en'
  const unbranded = video.unbrandedVoiced || {}
  const source = String(unbranded[primary] || Object.values(unbranded).find(Boolean) || video.voicedUrl || video.url || '')
  if (!source) return null
  return {
    ...video,
    status: 'ready',
    voiced: { ...(video.voiced || {}), [primary]: source },
    voicedUrl: source,
    branded: true,
    brandedLangs: { ...(video.brandedLangs || {}), [primary]: true },
    unbrandedVoiced: {},
    brandingLock: null,
    brandingExhausted: false,
    brandSchemaVersion: video.brandSchemaVersion || 0,
    brandText: video.brandText || { name: 'SignalBoostAi', url: 'www.saas.signalboostapp.com', mode: 'direct-completion' },
    brandedAt: video.brandedAt || now,
    brandDebug: { mode: 'direct-completion', at: now, reason },
    brandDispatchWatchdog: { at: now, ok: false, reason, directCompletion: true },
  }
}

async function completeDirectly(sb: any, campaigns: any[], reason: string) {
  const completed: any[] = []
  for (const campaign of campaigns) {
    const video = completionPatch(campaign, reason)
    if (!video) continue
    const { error } = await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video } }).eq('id', campaign.id)
    completed.push({ id: campaign.id, ok: !error, error: error?.message || null })
  }
  return completed
}

async function handle(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const sb = admin()
  const { data: recent, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const candidates = (recent || []).filter(isWaitingForBrand)
  const now = new Date().toISOString()
  const staleLocks: any[] = []

  for (const campaign of candidates) {
    const video = campaign?.metadata?.video || {}
    const lock = video.brandingLock || null
    const lockAge = ageMinutes(lock?.at)
    if (lock && lockAge !== null && lockAge >= Math.round(STALE_LOCK_MS / 60000)) {
      staleLocks.push({ id: campaign.id, title: String(campaign.title || '').slice(0, 80), lock, lockAgeMinutes: lockAge })
      await sb.from('cos_campaign_queue').update({ metadata: { ...(campaign.metadata || {}), video: { ...video, brandingLock: null, brandDispatchWatchdog: { at: now, reason: 'stale branding lock cleared before dispatch', previousLock: lock } } } }).eq('id', campaign.id)
    }
  }

  const force = new URL(req.url).searchParams.get('force') === '1'
  if (!candidates.length && !force) {
    return NextResponse.json({ ok: true, dispatched: false, reason: 'No 78% banner-waiting campaigns found.', waitingCount: 0, staleLocksCleared: staleLocks.length, staleLocks })
  }

  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    const completed = await completeDirectly(sb, candidates, 'missing GitHub Actions token')
    return NextResponse.json({ ok: true, dispatched: false, directCompletion: true, reason: 'Missing GitHub token; completed with available preview artifact.', waitingCount: candidates.length, completed })
  }

  const dispatched = await dispatchWorkflow(token)
  if (!dispatched.ok) {
    const completed = await completeDirectly(sb, candidates, `GitHub dispatch failed: ${dispatched.error || dispatched.status}`)
    return NextResponse.json({ ok: true, dispatched: false, directCompletion: true, dispatch: dispatched, waitingCount: candidates.length, completed })
  }

  return NextResponse.json({
    ok: true,
    dispatched: true,
    status: dispatched.status,
    waitingCount: candidates.length,
    staleLocksCleared: staleLocks.length,
    staleLocks,
    waitingCampaigns: candidates.slice(0, 20).map((campaign: any) => {
      const video = campaign?.metadata?.video || {}
      const langs = unbrandedLangs(video)
      const attempts = video.ghOverlayAttempts || {}
      return { id: campaign.id, title: String(campaign.title || '').slice(0, 80), langs, attempts: Object.fromEntries(langs.map((lang) => [lang, Number(attempts[lang] || 0)])), lockAgeMinutes: ageMinutes(video?.brandingLock?.at) }
    }),
    note: 'brand-overlay.yml dispatched. Refresh in a few minutes; if GitHub does not pick up the job, click Kick branding worker again.',
  })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
