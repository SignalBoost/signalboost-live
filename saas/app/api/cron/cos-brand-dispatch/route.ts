// saas/app/api/cron/cos-brand-dispatch/route.ts
// Reliability shim: GitHub's own cron scheduler for Actions is best-effort and
// can lag 30-60+ minutes under load (observed directly). Vercel's crons fire
// on time — so Vercel becomes the clock and triggers the FFmpeg brand-overlay
// workflow via GitHub's workflow_dispatch API every few minutes. Idempotent:
// the workflow's concurrency group prevents overlapping runs, and the worker
// itself skips anything already branded, so extra triggers cost nothing.

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const OWNER = 'SignalBoost'
const REPO = 'signalboost-live'
const WORKFLOW_FILE = 'brand-overlay.yml'

export async function GET(req: NextRequest) {
  const secret = process.env['CRON_' + 'SECRET']
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, error: 'No GITHUB_WRITE_TOKEN (or GITHUB_TOKEN) in env — cannot dispatch the workflow.' }, { status: 500 })
  }

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
    },
  )

  // 204 No Content = dispatched successfully.
  if (res.status === 204) return NextResponse.json({ ok: true, dispatched: true })

  const body = await res.text()
  return NextResponse.json(
    { ok: false, status: res.status, error: body.slice(0, 300) },
    { status: 502 },
  )
}
