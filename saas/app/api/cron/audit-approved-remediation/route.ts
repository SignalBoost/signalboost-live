// Recover the newest owner-approved audit run that has not yet completed its
// governed remediation. This never approves a run; durable approval must already
// exist in Supabase.
//
// The general-purpose recovery lane remains feature-gated. The canonical owned
// SignalBoost repository is different: its standing owner policy already granted
// Self-Healing authority, and repository-aware recovery is run-level idempotent via
// builder metadata. That owned lane therefore stays autonomous even when the
// general recovery flag is off.

import { NextRequest, NextResponse } from 'next/server'
import { runApprovedAuditRemediationWithRetry } from '@/lib/audit/approvedRunRemediationRetry'
import { parseRepoUrl } from '@/lib/audit/repoTarget'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REPO = 'SignalBoost/signalboost-live'
const BASE_BRANCH = 'main'

function isCanonicalOwnedTarget(value: string): boolean {
  const parsed = parseRepoUrl(String(value || '').trim())
  if (!parsed || parsed.repo.toLowerCase() !== REPO.toLowerCase()) return false
  return !parsed.branch || parsed.branch === BASE_BRANCH
}

function hasProducedRemediation(rows: any[]): boolean {
  return (rows || []).some((row) => {
    const payload = row?.payload
    if (!payload || payload.kind !== 'audit_batch_remediation') return false
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
    .select('id,prefix')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest.error) return NextResponse.json({ ok: false, error: latest.error.message }, { status: 500 })
  if (!latest.data?.id) return NextResponse.json({ ok: true, recovered: false, reason: 'No approved audit run found.' })

  const owned = isCanonicalOwnedTarget(String(latest.data.prefix || ''))
  if (!owned && process.env.AUDIT_APPROVED_REMEDIATION_CRON_ENABLED !== 'true') {
    return NextResponse.json({
      ok: true,
      recovered: false,
      runId: latest.data.id,
      reason: 'General audit approved remediation recovery is disabled.',
    })
  }

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
