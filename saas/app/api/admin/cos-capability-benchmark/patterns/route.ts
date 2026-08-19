// saas/app/api/admin/cos-capability-benchmark/patterns/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { analyzeBenchmarkFailures, type BenchmarkResultRow } from '@/lib/ai/cos/benchmarkFailurePatterns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RESULT_LIMIT = 1000

export async function GET(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const requested = Number(new URL(req.url).searchParams.get('limit'))
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(RESULT_LIMIT, Math.floor(requested)) : RESULT_LIMIT

  const results = await db
    .from('cos_capability_benchmark_results')
    .select('case_id,track,passed,reasons,response_source,local_model_invoked,external_ai_invoked,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (results.error) return NextResponse.json({ error: results.error.message }, { status: 500 })

  const report = analyzeBenchmarkFailures((results.data ?? []) as BenchmarkResultRow[])

  return NextResponse.json({
    ok: true,
    report,
    note: 'A failure on external_ai_used, semantic_cache_used, local_reasoning_not_recorded or an execution error tested the run conditions, not COS. Those attempts are excluded from capabilityPassRate — compare that number over time, not the raw rate.',
  })
}
