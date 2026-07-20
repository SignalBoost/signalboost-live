// Audit run history and detail. Because approval is already durable, an owner
// history refresh may safely recover the newest approved run's single remediation
// PR. The operation is idempotent and never approves a run or writes to main.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import type { ApprovedRunRemediationResult } from '@/lib/audit/approvedRunRemediation'
import { runApprovedAuditRemediationWithRetry } from '@/lib/audit/approvedRunRemediationRetry'
import { getAdminSupabase } from '@/utils/supabase/server'
import { localizeKnownFindingText, normalizeReportLang, reportLangFromCookie } from '@/lib/i18n/reportLanguage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

function localizeFinding(row: any, lang: string) {
  const localized = localizeKnownFindingText({
    category: row?.category,
    title: row?.title,
    detail: row?.detail,
    recommendation: row?.recommendation,
  }, lang)
  return {
    ...row,
    category: localized.category || row?.category,
    title: localized.title || row?.title,
    detail: localized.detail || row?.detail,
    recommendation: localized.recommendation || row?.recommendation,
  }
}

function localizeLogPayload(payload: any, lang: string) {
  if (!payload || typeof payload !== 'object') return payload ?? null
  if (!Array.isArray(payload.findings)) return payload
  return {
    ...payload,
    findings: payload.findings.map((finding: any) => localizeFinding(finding, lang)),
  }
}

function splitAuditPayloads(rows: any[]) {
  let scan: any = null
  let remediation: ApprovedRunRemediationResult | null = null
  for (const row of rows || []) {
    const payload = row?.payload
    if (!payload || typeof payload !== 'object') continue
    if (!remediation && payload.kind === 'audit_batch_remediation' && payload.approval === 'final') {
      remediation = payload as ApprovedRunRemediationResult
      continue
    }
    if (!scan && Array.isArray(payload.findings)) scan = payload
    if (scan && remediation) break
  }
  return { scan, remediation }
}

async function recoverApprovedRun(admin: any, runId: string, actorUserId: string) {
  try {
    return await runApprovedAuditRemediationWithRetry({ admin, runId, actorUserId })
  } catch (error) {
    return {
      kind: 'audit_batch_remediation',
      ok: false,
      approval: 'final',
      runId,
      status: 'failed',
      branch: '',
      prUrl: '',
      prNumber: 0,
      autoMergeQueued: false,
      autoMergeError: '',
      findingsTotal: 0,
      findingsApplied: 0,
      findingsAlreadyResolved: 0,
      filesChanged: 0,
      skipped: [{ file: '(recovery)', findingCount: 0, reason: error instanceof Error ? error.message : 'Approved remediation recovery failed.' }],
      approvedAt: new Date().toISOString(),
    } satisfies ApprovedRunRemediationResult
  }
}

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner || !ctx.userId) {
    return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })
  }

  const lang = normalizeReportLang(reportLangFromCookie(req.headers.get('cookie')))
  const admin = getAdminSupabase()
  const runId = new URL(req.url).searchParams.get('runId')

  if (runId) {
    const run = await admin.from('audit_runs').select('*').eq('id', runId).single()
    if (run.error || !run.data) {
      return NextResponse.json({ ok: false, error: 'Run not found.' }, { status: 404 })
    }

    const recovery = run.data.status === 'approved'
      ? await recoverApprovedRun(admin, runId, ctx.userId)
      : null

    const findingsResult = await admin.from('audit_findings').select('*').eq('run_id', runId)
    if (findingsResult.error) {
      return NextResponse.json({ ok: false, error: findingsResult.error.message }, { status: 500 })
    }
    const findings = (findingsResult.data || []).slice().sort(
      (a: any, b: any) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9),
    ).map((row: any) => localizeFinding(row, lang))

    const logRows = await admin
      .from('audit_logs')
      .select('payload')
      .eq('run_id', runId)
      .order('created_at', { ascending: false })
      .limit(50)
    const payloads = splitAuditPayloads(logRows.data || [])

    return NextResponse.json({
      ok: true,
      run: run.data,
      findings,
      log: localizeLogPayload(payloads.scan, lang),
      // For approved runs, the recovery call is the freshest lifecycle state.
      // Older durable logs remain the fallback for already-remediated history.
      remediation: recovery || payloads.remediation,
    })
  }

  const runs = await admin
    .from('audit_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  if (runs.error) {
    return NextResponse.json({ ok: false, error: runs.error.message }, { status: 500 })
  }

  const newestApproved = (runs.data || []).find((run: any) => run?.status === 'approved')
  const recovery = newestApproved?.id
    ? await recoverApprovedRun(admin, String(newestApproved.id), ctx.userId)
    : null

  return NextResponse.json({ ok: true, runs: runs.data || [], recovery })
}
