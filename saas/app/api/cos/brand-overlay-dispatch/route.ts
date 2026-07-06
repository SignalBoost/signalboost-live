import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const OWNER = 'SignalBoost'
const REPO = 'signalboost-live'
const WORKFLOW_FILE = 'brand-overlay.yml'
const VIDEO_CHANNELS = ['youtube', 'short_video']
const MAX_ATTEMPTS = 5
const DISPATCH_TIMEOUT_MS = 10_000

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

async function handle(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })
  const sb = admin()
  const { data: recent, error } = await sb.from('cos_campaign_queue').select('*').in('channel', VIDEO_CHANNELS).neq('status', 'rejected').order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const candidates = (recent || []).filter(isWaitingForBrand)
  const force = new URL(req.url).searchParams.get('force') === '1'
  if (!candidates.length && !force) return NextResponse.json({ ok: true, dispatched: false, reason: 'No banner-waiting campaigns found.', waitingCount: 0 })
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    const marked = await markDispatchError(sb, candidates, 'missing GitHub Actions token')
    return NextResponse.json({ ok: false, dispatched: false, waitingCount: candidates.length, marked, error: 'Missing GitHub token.' }, { status: 500 })
  }
  const dispatched = await dispatchWorkflow(token)
  if (!dispatched.ok) {
    const marked = await markDispatchError(sb, candidates, `workflow dispatch failed: ${dispatched.error || dispatched.status}`)
    return NextResponse.json({ ok: false, dispatched: false, dispatch: dispatched, waitingCount: candidates.length, marked }, { status: 502 })
  }
  return NextResponse.json({ ok: true, dispatched: true, status: dispatched.status, waitingCount: candidates.length })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
