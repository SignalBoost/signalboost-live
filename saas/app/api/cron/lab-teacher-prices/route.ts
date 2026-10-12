// saas/app/api/cron/lab-teacher-prices/route.ts
// Scheduled: keeps LAB OpenRouter teacher prices current from OpenRouter's public model list.
// Reads one public catalog (no key, no customer data, no spend) and hands the parsed prices to a service-role-only
// database function that opens/closes price rows. Returns counts only.
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getAdminSupabase } from '@/utils/supabase/server'
import { OPENROUTER_MODELS_URL, syncOpenRouterTeacherPrices } from '@/lib/lab/openRouterTeacherPrices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'cache-control': 'no-store' }

const authorized = (header: string | null, secret: string | undefined) => {
  if (!header?.startsWith('Bearer ') || !secret || secret.length < 32) return false
  const a = Buffer.from(header.slice(7)), b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  if (!authorized(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers })
  }
  let payload: unknown
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return NextResponse.json({ ok: false, error: 'lab_price_source_unavailable' }, { status: 502, headers })
    payload = await response.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'lab_price_source_unavailable' }, { status: 502, headers })
  }
  const admin = getAdminSupabase()
  const outcome = await syncOpenRouterTeacherPrices(payload, (fn, args) => admin.rpc(fn, args))
  if (!outcome.ok) return NextResponse.json({ ...outcome, provider: 'openrouter' }, { status: outcome.error === 'lab_price_sync_failed' ? 503 : 502, headers })
  return NextResponse.json({ ...outcome, provider: 'openrouter' }, { headers })
}
