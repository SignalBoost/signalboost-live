// saas/app/api/cron/cos-workforce-verification-trace/route.ts
//
// Read-only Workforce verification trace (owner 2026-10-06): why served graduate work never becomes a verified
// Production outcome. Counts only. Read only by construction (readOnlyDb). CRON_SECRET so the GitHub Actions
// watchdog can print it; it starts no work and spends nothing.
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { readOnlyDb } from '@/lib/ai/cos/cosUniversityReadOnlyDb'
import { describeWorkforceTrace, readWorkforceVerificationTrace } from '@/lib/ai/cos/cosWorkforceVerificationTrace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  const service = cosServiceDb()
  if (!service) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503, headers: NO_STORE })
  try {
    const trace = await readWorkforceVerificationTrace({ db: readOnlyDb(service) })
    return NextResponse.json({ ok: true, summary: describeWorkforceTrace(trace), trace }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return NextResponse.json({ ok: false, error: String(message).slice(0, 400), readOnly: true }, { status: 500, headers: NO_STORE })
  }
}
// end of saas/app/api/cron/cos-workforce-verification-trace/route.ts (if this line is missing, the paste was cut short)
