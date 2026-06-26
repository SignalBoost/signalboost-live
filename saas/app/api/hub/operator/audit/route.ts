// saas/app/api/hub/operator/audit/route.ts
// Primary orchestration endpoint for the Audit Project microservice.
// Streams NDJSON phase events as the run progresses, so the console can animate
// a real-time tracker. Phases (one JSON object per line):
//   {phase:'SCAN_TARGET', prefix}
//   {phase:'RUN_ANALYZERS', done, total}        (repeated as files complete)
//   {phase:'GENERATE_REPORT', findings}
//   {phase:'PREPARE_PRS'}                        (findings stored, ready to patch)
//   {phase:'DONE', ok, runId, filesScanned, findingsCount, findings}
//   {phase:'ERROR', error}
// Owner-gated. Persists to Supabase (audit_runs + audit_findings).
// Note: a run does NOT create PRs — PREPARE_PRS marks that findings are stored and
// patchable via the per-finding drawer flow. Load-isolated with its own duration.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { runAudit } from '@/lib/audit/runner'
import { checkScanQuota, clampScanSize } from '@/lib/audit/scanThrottle'
import { collectProviderTemplateSnapshot } from '@/lib/audit/providerTemplateSnapshot'
import { writeSnapshot } from '@/lib/audit/snapshotCache'
import { normalizeReportLang, reportLangFromCookie } from '@/lib/i18n/reportLanguage'

export const runtime     = 'nodejs'
export const maxDuration = 300

async function preflightOpenAI(): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { ok: false, error: 'OPENAI_API_KEY is not configured.' }
  try {
    const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `OpenAI key did not authenticate (HTTP ${res.status}).` }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'OpenAI preflight request failed.' }
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.userId) {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  }

  const admin = getAdminSupabase()
  const quota = await checkScanQuota(admin, { userId: ctx.userId, isOwner: ctx.isOwner })
  if (!quota.ok) {
    const capLabel = quota.cap == null ? '∞' : String(quota.cap)
    const windowLabel = quota.window === 'lifetime' ? 'lifetime' : 'this month'
    return NextResponse.json(
      {
        ok: false,
        code: 'scan_quota_exceeded',
        upgrade: true,
        tier: quota.tier,
        window: quota.window,
        cap: quota.cap,
        used: quota.used,
        error: `Scan limit reached: ${quota.used}/${capLabel} audit scans used ${windowLabel}. Upgrade your plan to run more.`,
      },
      { status: 402 },
    )
  }

  let body: { url?: string; prefix?: string; maxFiles?: number; lang?: string } = {}
  try { body = await req.json() } catch { /* defaults apply */ }
  const lang = normalizeReportLang(body.lang || reportLangFromCookie(req.headers.get('cookie')))
  const target   = typeof body.url === 'string' && body.url.trim()
    ? body.url.trim()
    : (typeof body.prefix === 'string' && body.prefix.trim() ? body.prefix.trim() : '')
  const prefix   = target || 'https://github.com/SignalBoost/signalboost-live'
  const maxFiles = clampScanSize(body.maxFiles, quota.tier)

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(enc.encode(JSON.stringify(obj) + '\n')) } catch { /* client gone */ }
      }
      try {
        const pre = await preflightOpenAI()
        if (!pre.ok) { send({ phase: 'ERROR', error: `Preflight failed: ${pre.error}` }); controller.close(); return }

        send({ phase: 'SCAN_TARGET', prefix })

        const started = await admin.from('audit_runs').insert({ status: 'running', prefix, created_by: ctx.userId }).select('id').single()
        if (started.error || !started.data) {
          send({ phase: 'ERROR', error: `Could not open audit run: ${started.error?.message || 'insert failed'}` }); controller.close(); return
        }
        const runId = started.data.id as string

        const result = await runAudit({
          url: prefix,
          maxFiles,
          lang,
          onProgress: (done, total) => send({ phase: 'RUN_ANALYZERS', done, total }),
        })

        if (!result.ok) {
          await admin.from('audit_runs').update({ status: 'failed', error: result.error || 'runner error', files_scanned: 0, findings_count: 0 }).eq('id', runId)
          send({ phase: 'ERROR', runId, error: result.error || 'Audit runner failed.' }); controller.close(); return
        }

        send({ phase: 'GENERATE_REPORT', findings: result.findings.length })

        if (result.findings.length > 0) {
          const rows = result.findings.map(f => ({
            run_id: runId, file: f.file, severity: f.severity, category: f.category,
            title: f.title, detail: f.detail, recommendation: f.recommendation, line: f.line ?? null,
          }))
          const ins = await admin.from('audit_findings').insert(rows)
          if (ins.error) {
            await admin.from('audit_runs').update({ status: 'failed', error: `findings insert: ${ins.error.message}` }).eq('id', runId)
            send({ phase: 'ERROR', runId, error: `Could not store findings: ${ins.error.message}` }); controller.close(); return
          }
        }

        send({ phase: 'PREPARE_PRS' })

        await admin.from('audit_runs').update({
          status: 'complete', files_scanned: result.filesScanned.length,
          findings_count: result.findings.length, provider: 'openai', model: 'gpt-5.5',
        }).eq('id', runId)

        const payload = { runId, prefix, filesScanned: result.filesScanned, findingsCount: result.findings.length, findings: result.findings, lang }
        await admin.from('audit_logs').insert({ run_id: runId, user_id: ctx.userId, payload })

        try {
          const snapshot = await collectProviderTemplateSnapshot()
          ;(snapshot as any).narrative = result.narrative || ''
          ;(snapshot as any).lang = lang
          await writeSnapshot(admin, { runId, userId: ctx.userId, snapshot })
        } catch (snapErr) {
          console.error('audit snapshot cache write failed', snapErr instanceof Error ? snapErr.message : snapErr)
        }

        send({ phase: 'DONE', ok: true, ...payload })
        controller.close()
      } catch (e: unknown) {
        send({ phase: 'ERROR', error: e instanceof Error ? e.message : 'Audit run failed.' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
    },
  })
}
