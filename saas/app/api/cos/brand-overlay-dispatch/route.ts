// saas/app/api/cos/brand-overlay-dispatch/route.ts
// Owner-only manual kick for the COSA FFmpeg brand-overlay worker.
//
// This route intentionally does ONE thing: dispatch the GitHub Actions
// brand-overlay.yml workflow. The actual FFmpeg burn happens in GitHub Actions,
// where FFmpeg is installed by the workflow. Do not run local FFmpeg from Vercel:
// Vercel functions do not reliably provide the ffmpeg binary and that fallback
// made 78% videos look like pipeline failures even when the correct next step was
// simply to dispatch the GitHub worker.

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
const DISPATCH_TIMEOUT_MS = 30_000

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function keys(obj: any): string[] {
  return obj && typeof obj === 'object' ? Object.keys(obj) : []
}

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
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        // IMPORTANT: brand-overlay.yml declares workflow_dispatch: {} with no
        // inputs. Sending an inputs object can make GitHub reject the dispatch.
        body: JSON.stringify({ ref: 'main' }),
        cache: 'no-store',
        signal: controller.signal,
      },
    )

    clearTimeout(timer)
    if (res.status === 204) return { ok: true, status: res.status, error: null }

    const error = (await res.text()).slice(0, 1000)
    console.error('brand overlay dispatch failed', { status: res.status, error })
    return { ok: false, status: res.status, error }
  } catch (error) {
    clearTimeout(timer)
    const message = error instanceof Error ? error.message : 'dispatch failed'
    console.error('brand overlay dispatch exception', { message })
    return { ok: false, status: 0, error: message }
  }
}

async function markDispatchStatus(sb: any, campaigns: any[], dispatch: any, tokenPresent: boolean) {
  const now = new Date().toISOString()
  const marked: any[] = []

  for (const campaign of campaigns) {
    const video = campaign?.metadata?.video || {}
    const waiting = unbrandedLangs(video)
    const attempts = video.ghOverlayAttempts || {}

    const { error } = await sb.from('cos_campaign_queue').update({
      metadata: {
        ...(campaign.metadata || {}),
        video: {
          ...video,
          brandingLock: null,
          brandDispatchWatchdog: {
            at: now,
            ok: dispatch.ok,
            status: dispatch.status,
            error: dispatch.error,
            workflow: WORKFLOW_FILE,
            tokenPresent,
            waitingLangs: waiting,
            attempts: Object.fromEntries(waiting.map((lang) => [lang, Number(attempts[lang] || 0)])),
            note: dispatch.ok
              ? 'GitHub FFmpeg brand-overlay workflow dispatched. The worker will increment attempts when it actually processes a campaign.'
              : 'GitHub FFmpeg brand-overlay workflow dispatch failed. Check token permissions and GitHub Actions run logs.',
          },
        },
      },
    }).eq('id', campaign.id)

    marked.push({ id: campaign.id, ok: !error, error: error?.message || null })
  }

  return marked
}

async function handle(_req: NextRequest) {
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
  if (!candidates.length) {
    return NextResponse.json({ ok: true, dispatched: false, reason: 'No banner-waiting campaigns found.', waitingCount: 0 })
  }

  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    const dispatch = { ok: false, status: 0, error: 'Missing GITHUB_WRITE_TOKEN or GITHUB_TOKEN in Vercel env.' }
    const marked = await markDispatchStatus(sb, candidates, dispatch, false)
    return NextResponse.json({ ok: false, dispatched: false, waitingCount: candidates.length, marked, error: dispatch.error }, { status: 500 })
  }

  const dispatch = await dispatchWorkflow(token)
  const marked = await markDispatchStatus(sb, candidates, dispatch, true)

  return NextResponse.json({
    ok: dispatch.ok,
    dispatched: dispatch.ok,
    status: dispatch.status,
    error: dispatch.error,
    waitingCount: candidates.length,
    marked,
    note: dispatch.ok
      ? 'brand-overlay.yml dispatched. Refresh in a few minutes after GitHub Actions finishes the FFmpeg burn.'
      : 'GitHub workflow dispatch failed. Check GITHUB_WRITE_TOKEN permissions and GitHub Actions availability.',
  }, { status: dispatch.ok ? 200 : 502 })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
