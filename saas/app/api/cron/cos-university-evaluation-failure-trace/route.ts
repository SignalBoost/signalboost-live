// saas/app/api/cron/cos-university-evaluation-failure-trace/route.ts
//
// Read-only evaluation-failure trace (owner 2026-10-06, Step 1 order of work: evaluation infrastructure failures first).
// Per failure family over 7 days: attribution, per-day counts, last seen; runtime_not_ready split by worker stage.
// Counts only. Read only by construction (readOnlyDb). CRON_SECRET so the GitHub Actions watchdog can print it.
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { readOnlyDb } from '@/lib/ai/cos/cosUniversityReadOnlyDb'
import { describeEvaluationFailureTrace, readEvaluationFailureTrace } from '@/lib/ai/cos/cosUniversityEvaluationFailureTrace'

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
    const trace = await readEvaluationFailureTrace({ db: readOnlyDb(service) })
    return NextResponse.json({ ok: true, summary: describeEvaluationFailureTrace(trace), trace }, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return NextResponse.json({ ok: false, error: String(message).slice(0, 400), readOnly: true }, { status: 500, headers: NO_STORE })
  }
}
// end of saas/app/api/cron/cos-university-evaluation-failure-trace/route.ts (if this line is missing, the paste was cut short)
