// saas/app/api/cos/brand-overlay-dispatch/route.ts
// Owner-only manual/watchdog kick for the COSA FFmpeg brand-overlay worker.
// Use this when campaigns are stuck at 78%: voice/captions ready but branded final missing.

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
    },
  )
  if (res.status === 204) return { ok: true, status: res.status, error: null }
  return { ok: false, status: res.status, error: (await res.text()).slice(0, 500) }
}

async function handle(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, error: 'No GITHUB_WRITE_TOKEN or GITHUB_TOKEN in Vercel env. Cannot dispatch brand-overlay.yml.' }, { status: 500 })
  }

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
      await sb.from('cos_campaign_queue').update({
        metadata: {
          ...(campaign.metadata || {}),
          video: {
            ...video,
            brandingLock: null,
            brandDispatchWatchdog: {
              at: now,
              reason: 'stale branding lock cleared before manual owner dispatch',
              previousLock: lock,
            },
          },
        },
      }).eq('id', campaign.id)
    }
  }

  const force = new URL(req.url).searchParams.get('force') === '1'
  if (!candidates.length && !force) {
    return NextResponse.json({ ok: true, dispatched: false, reason: 'No 78% banner-waiting campaigns found.', waitingCount: 0, staleLocksCleared: staleLocks.length, staleLocks })
  }

  const dispatched = await dispatchWorkflow(token)
  return NextResponse.json({
    ok: dispatched.ok,
    dispatched: dispatched.ok,
    status: dispatched.status,
    error: dispatched.error,
    waitingCount: candidates.length,
    staleLocksCleared: staleLocks.length,
    staleLocks,
    waitingCampaigns: candidates.slice(0, 20).map((campaign: any) => {
      const video = campaign?.metadata?.video || {}
      const langs = unbrandedLangs(video)
      const attempts = video.ghOverlayAttempts || {}
      return {
        id: campaign.id,
        title: String(campaign.title || '').slice(0, 80),
        langs,
        attempts: Object.fromEntries(langs.map((lang) => [lang, Number(attempts[lang] || 0)])),
        lockAgeMinutes: ageMinutes(video?.brandingLock?.at),
      }
    }),
    note: dispatched.ok ? 'brand-overlay.yml dispatched. Refresh in a few minutes; the worker must burn the final banner and update brandedLangs/voicedUrl.' : 'GitHub workflow dispatch failed.',
  }, { status: dispatched.ok ? 200 : 502 })
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
