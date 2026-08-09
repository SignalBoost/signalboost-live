// Recover the newest owner-approved audit run that has not yet produced its
// governed remediation PR. This never approves a run; durable approval must
// already exist in Supabase.

import { NextRequest, NextResponse } from 'next/server'
import { runApprovedAuditRemediationWithRetry } from '@/lib/audit/approvedRunRemediationRetry'
import { recordApprovedRemediationHeartbeat } from '@/lib/audit/remediationHeartbeat'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

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

  const approval = await admin
    .from('audit_remediation_approvals')
    .select('approved_by')
    .eq('run_id', latest.data.id)
    .maybeSingle()
  if (approval.error || !approval.data?.approved_by) {
    return NextResponse.json({ ok: true, recovered: false, runId: latest.data.id, reason: 'The latest approved run has no durable approval record.' })
  }

  const actorUserId = String(approval.data.approved_by)
  await recordApprovedRemediationHeartbeat({
    admin,
    runId: latest.data.id,
    actorUserId,
    lifecycleStatus: 'preparing',
  })

  const remediation = await runApprovedAuditRemediationWithRetry({
    admin,
    runId: latest.data.id,
    actorUserId,
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
