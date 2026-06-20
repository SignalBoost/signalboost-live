// saas/app/api/hub/operator/audit/runs/route.ts
// Run history + run detail for the Audit Console (Step 2).
//   GET                 -> { ok, runs }            (recent 30 runs)
//   GET ?runId=<uuid>   -> { ok, run, findings }   (one run + its findings)
// Owner-gated; reads via the service-role admin client.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) {
    return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })
  }

  const admin = getAdminSupabase()
  const runId = new URL(req.url).searchParams.get('runId')

  if (runId) {
    const run = await admin.from('audit_runs').select('*').eq('id', runId).single()
    if (run.error || !run.data) {
      return NextResponse.json({ ok: false, error: 'Run not found.' }, { status: 404 })
    }
    const f = await admin.from('audit_findings').select('*').eq('run_id', runId)
    if (f.error) {
      return NextResponse.json({ ok: false, error: f.error.message }, { status: 500 })
    }
    const findings = (f.data || []).slice().sort(
      (a: any, b: any) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9),
    )
    // Full-payload snapshot (preferred rehydration source); null for pre-snapshot runs.
    const logRow = await admin.from('audit_logs').select('payload').eq('run_id', runId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    return NextResponse.json({ ok: true, run: run.data, findings, log: logRow.data?.payload ?? null })
  }

  const runs = await admin
    .from('audit_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  if (runs.error) {
    return NextResponse.json({ ok: false, error: runs.error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, runs: runs.data || [] })
}
