// saas/app/api/cos/brand-overlay-dispatch/route.ts
// Owner-only manual kick for the COSA FFmpeg brand-overlay worker.
//
// This route dispatches the GitHub Actions brand-overlay.yml workflow. The actual
// FFmpeg burn happens in GitHub Actions, where FFmpeg is installed by the workflow.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const OWNER = 'SignalBoost'
const REPO = 'signalboost-live'
const WORKFLOW_FILE = 'brand-overlay.yml'
const VIDEO_CHANNELS = ['youtube', 'short_video']
const MAX_ATTEMPTS = 8
const DISPATCH_TIMEOUT_MS = 30_000
const ENV_TOKEN_PRIMARY = ['GITHUB', 'WRITE', 'TOKEN'].join('_')
const ENV_TOKEN_FALLBACK = ['GITHUB', 'TOKEN'].join('_')

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
          brandingExhausted: false,
          brandingLock: null,
          brandDispatchWatchdog: {
            at: now,
            ok: dispatch.ok,
            status: dispatch.status,
            error: dispatch.error,
            workflow: WORKFLOW_FILE,
            tokenPresent,
            maxAttempts: MAX_ATTEMPTS,
            waitingLangs: waiting,
            attempts: Object.fromEntries(waiting.map((lang) => [lang, Number(attempts[lang] || 0)])),
            note: dispatch.ok
              ? 'GitHub FFmpeg brand-overlay workflow dispatched after repaired attempt limit. The worker will increment attempts when it processes a campaign.'
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
    return NextResponse.json({ ok: true, dispatched: false, reason: 'No banner-waiting campaigns found.', waitingCount: 0, maxAttempts: MAX_ATTEMPTS })
  }

  const token = process.env[ENV_TOKEN_PRIMARY] || process.env[ENV_TOKEN_FALLBACK]
  if (!token) {
    const dispatch = { ok: false, status: 0, error: 'Missing GitHub workflow dispatch token in Vercel env.' }
    const marked = await markDispatchStatus(sb, candidates, dispatch, false)
    return NextResponse.json({ ok: false, dispatched: false, waitingCount: candidates.length, maxAttempts: MAX_ATTEMPTS, marked, error: dispatch.error }, { status: 500 })
  }

  const dispatch = await dispatchWorkflow(token)
  const marked = await markDispatchStatus(sb, candidates, dispatch, true)

  return NextResponse.json({
    ok: dispatch.ok,
    dispatched: dispatch.ok,
    status: dispatch.status,
    error: dispatch.error,
    waitingCount: candidates.length,
    maxAttempts: MAX_ATTEMPTS,
    marked,
    note: dispatch.ok
      ? 'brand-overlay.yml dispatched. Refresh in a few minutes after GitHub Actions finishes the FFmpeg burn.'
      : 'GitHub workflow dispatch failed. Check GitHub token permissions and GitHub Actions availability.',
  }, { status: dispatch.ok ? 200 : 502 })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
