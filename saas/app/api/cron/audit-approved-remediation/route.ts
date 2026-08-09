// Recover the newest owner-approved audit run that has not yet produced its
// governed remediation PR. This never approves a run; durable approval must
// already exist in Supabase.
//
// IMPORTANT: once a run has produced a remediation branch/PR, cron must stop
// touching it. Re-running the same approved run can create no-op Git commits,
// which in turn trigger unnecessary Vercel preview deployments indefinitely.

import { NextRequest, NextResponse } from 'next/server'
import { runApprovedAuditRemediationWithRetry } from '@/lib/audit/approvedRunRemediationRetry'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function hasProducedRemediation(rows: any[]): boolean {
  return (rows || []).some((row) => {
    const payload = row?.payload
    if (!payload || payload.kind !== 'audit_batch_remediation') return false

    // A branch, PR, or commit-worthy file change means this approved run has
    // already been handed off to GitHub. Cron recovery is not allowed to keep
    // replaying it. Partial remediation can be resumed explicitly by the
    // governed recovery path rather than every scheduled cron invocation.
    return Boolean(
      payload.branch ||
      payload.prUrl ||
      Number(payload.prNumber || 0) > 0 ||
      Number(payload.filesChanged || 0) > 0
    )
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get('authorization') || ''
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminSupabase()
  const latest = await admin
    .from('audit_runs')
    .select('id')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest.error) return NextResponse.json({ ok: false, error: latest.error.message }, { status: 500 })
  if (!latest.data?.id) return NextResponse.json({ ok: true, recovered: false, reason: 'No approved audit run found.' })

  // Idempotency guard: do not replay an approved run after it has already
  // produced GitHub remediation work. This is the circuit breaker that stops
  // repeated identical commits and Vercel preview builds.
  const priorLogs = await admin
    .from('audit_logs')
    .select('payload')
    .eq('run_id', latest.data.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (priorLogs.error) {
    return NextResponse.json({ ok: false, error: priorLogs.error.message }, { status: 500 })
  }

  if (hasProducedRemediation(priorLogs.data || [])) {
    return NextResponse.json({
      ok: true,
      recovered: false,
      runId: latest.data.id,
      reason: 'Remediation already produced GitHub work; replay suppressed.',
    })
  }

  const approval = await admin
    .from('audit_remediation_approvals')
    .select('approved_by')
    .eq('run_id', latest.data.id)
    .maybeSingle()
  if (approval.error || !approval.data?.approved_by) {
    return NextResponse.json({ ok: true, recovered: false, runId: latest.data.id, reason: 'The latest approved run has no durable approval record.' })
  }

  const remediation = await runApprovedAuditRemediationWithRetry({
    admin,
    runId: latest.data.id,
    actorUserId: String(approval.data.approved_by),
  })

  return NextResponse.json({
    ok: remediation.ok,
    recovered: remediation.ok,
    runId: latest.data.id,
    remediation,
  }, { status: remediation.ok ? 200 : 502 })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
