// saas/app/api/hub/operator/audit/runs/route.ts
// Run history + run detail for the Audit Console.
//   GET                 -> { ok, runs }                         (recent 30 runs)
//   GET ?runId=<uuid>   -> { ok, run, findings, log, remediation }
// Owner-gated; reads via the service-role admin client.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { localizeKnownFindingText, normalizeReportLang, reportLangFromCookie } from '@/lib/i18n/reportLanguage'

export const runtime = 'nodejs'

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
  let remediation: any = null
  for (const row of rows || []) {
    const payload = row?.payload
    if (!payload || typeof payload !== 'object') continue
    if (!remediation && payload.kind === 'audit_batch_remediation' && payload.approval === 'final') {
      remediation = payload
      continue
    }
    if (!scan && Array.isArray(payload.findings)) scan = payload
    if (scan && remediation) break
  }
  return { scan, remediation }
}

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) {
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
    const f = await admin.from('audit_findings').select('*').eq('run_id', runId)
    if (f.error) {
      return NextResponse.json({ ok: false, error: f.error.message }, { status: 500 })
    }
    const findings = (f.data || []).slice().sort(
      (a: any, b: any) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9),
    ).map((row: any) => localizeFinding(row, lang))

    // A remediation result is also stored in audit_logs. Read several recent rows
    // and keep the original scan snapshot separate so one-click approval never
    // replaces the payload used to rehydrate the findings list.
    const logRows = await admin
      .from('audit_logs')
      .select('payload')
      .eq('run_id', runId)
      .order('created_at', { ascending: false })
      .limit(30)
    const payloads = splitAuditPayloads(logRows.data || [])

    return NextResponse.json({
      ok: true,
      run: run.data,
      findings,
      log: localizeLogPayload(payloads.scan, lang),
      remediation: payloads.remediation,
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
  return NextResponse.json({ ok: true, runs: runs.data || [] })
}
