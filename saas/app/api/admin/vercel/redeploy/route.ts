// saas/app/api/admin/vercel/redeploy/route.ts
// Owner-gated Vercel redeploy trigger.
//
// Uses VERCEL_DEPLOY_HOOK_URL server-side only. The hook URL is never returned
// to the browser, logs, or provider action response.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function configured(name: string): boolean {
  const value = process.env[name]
  return Boolean(value && value.trim())
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  return NextResponse.json({
    ok: true,
    route: '/api/admin/vercel/redeploy',
    methods: ['GET', 'POST'],
    mode: 'owner-only',
    configured: {
      deployHook: configured('VERCEL_DEPLOY_HOOK_URL'),
    },
    rawSecretsReturned: false,
    note: 'GET is a safe readiness check. POST triggers the Vercel deploy hook server-side.',
  })
}

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const hook = process.env.VERCEL_DEPLOY_HOOK_URL
  if (!hook || !hook.trim()) {
    return NextResponse.json({
      ok: false,
      error: 'VERCEL_DEPLOY_HOOK_URL is not configured.',
      rawSecretsReturned: false,
    }, { status: 500 })
  }

  const res = await fetch(hook, {
    method: 'POST',
    cache: 'no-store',
  })

  const text = await res.text().catch(() => '')
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }

  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      error: `Vercel deploy hook failed with HTTP ${res.status}`,
      rawSecretsReturned: false,
      detail: data?.error?.message || data?.message || text.slice(0, 160) || null,
    }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    message: 'Vercel redeploy triggered.',
    rawSecretsReturned: false,
    data: {
      triggeredAt: new Date().toISOString(),
      provider: 'vercel',
      deploymentId: data?.id || data?.job?.id || null,
      status: data?.state || data?.job?.state || 'queued',
    },
  })
}
