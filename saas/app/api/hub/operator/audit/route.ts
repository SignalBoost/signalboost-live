// saas/app/api/hub/operator/audit/route.ts
// Primary orchestration endpoint for the Audit Project microservice.
// Flow: owner-gate → OpenAI preflight → trigger analyzer runner → persist to
// Supabase (audit_runs + audit_findings) → return a summary.
//
// Load isolation: this runs as its own route with its own duration budget so a
// deep scan never competes with live console traffic.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { runAudit } from '@/lib/audit/runner'

export const runtime     = 'nodejs'
export const maxDuration = 300

// ── OpenAI preflight (mirrors providers/verify) ──────────────────────────────
async function preflightOpenAI(): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { ok: false, error: 'OPENAI_API_KEY is not configured.' }
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      cache:   'no-store',
    })
    if (!res.ok) return { ok: false, error: `OpenAI key did not authenticate (HTTP ${res.status}).` }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'OpenAI preflight request failed.' }
  }
}

export async function POST(req: NextRequest) {
  // Deep infra/security auditing is owner-only.
  const ctx = await getAccess()
  if (!ctx.isOwner) {
    return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })
  }

  let body: { prefix?: string; maxFiles?: number } = {}
  try { body = await req.json() } catch { /* empty body is fine — defaults apply */ }

  const prefix   = typeof body.prefix === 'string' && body.prefix.trim() ? body.prefix.trim() : 'saas/app/api'
  const maxFiles = typeof body.maxFiles === 'number' ? body.maxFiles : 6

  const pre = await preflightOpenAI()
  if (!pre.ok) {
    return NextResponse.json({ ok: false, error: `Preflight failed: ${pre.error}` }, { status: 503 })
  }

  const admin = getAdminSupabase()

  // Open a run record.
  const started = await admin
    .from('audit_runs')
    .insert({ status: 'running', prefix, created_by: ctx.userId })
    .select('id')
    .single()

  if (started.error || !started.data) {
    return NextResponse.json({ ok: false, error: `Could not open audit run: ${started.error?.message || 'insert failed'}` }, { status: 500 })
  }
  const runId = started.data.id as string

  // Trigger the independent analyzer runner.
  const result = await runAudit({ prefix, maxFiles })

  if (!result.ok) {
    await admin.from('audit_runs').update({
      status:        'failed',
      error:         result.error || 'runner error',
      files_scanned: 0,
      findings_count: 0,
    }).eq('id', runId)
    return NextResponse.json({ ok: false, runId, error: result.error || 'Audit runner failed.' }, { status: 500 })
  }

  // Persist findings.
  if (result.findings.length > 0) {
    const rows = result.findings.map(f => ({
      run_id:         runId,
      file:           f.file,
      severity:       f.severity,
      category:       f.category,
      title:          f.title,
      detail:         f.detail,
      recommendation: f.recommendation,
      line:           f.line ?? null,
    }))
    const ins = await admin.from('audit_findings').insert(rows)
    if (ins.error) {
      await admin.from('audit_runs').update({ status: 'failed', error: `findings insert: ${ins.error.message}` }).eq('id', runId)
      return NextResponse.json({ ok: false, runId, error: `Could not store findings: ${ins.error.message}` }, { status: 500 })
    }
  }

  await admin.from('audit_runs').update({
    status:         'complete',
    files_scanned:  result.filesScanned.length,
    findings_count: result.findings.length,
    provider:       'openai',
    model:          'gpt-5.5',
  }).eq('id', runId)

  return NextResponse.json({
    ok:            true,
    runId,
    prefix,
    filesScanned:  result.filesScanned,
    findingsCount: result.findings.length,
    findings:      result.findings,
  })
}
