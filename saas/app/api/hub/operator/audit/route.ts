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

  // Access is governed PURELY by the audit-tier entitlement throttle — no isAdmin
  // gate. checkScanQuota() reads the live audit tier (subscriptions.audit_plan /
  // audit_status, NOT subscriptions.plan): owner ⇒ master/exempt, Free ⇒ 1 lifetime
  // scan, paid tiers ⇒ their monthly cap. Over cap returns 402 (upgrade).
  // NOTE: every caller's scan still targets AUDIT_GITHUB_REPO (the configured repo)
  // until a per-customer scan target is wired — keep that in mind before promoting
  // customer access broadly.
  const admin = getAdminSupabase()

  // Throttle policy — resolve the tier for everyone (owner ⇒ exempt enterprise),
  // and hard-block non-owners at their tier cap. The resolved tier also drives
  // the pre-call size clamp below.
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

  let body: { prefix?: string; maxFiles?: number } = {}
  try { body = await req.json() } catch { /* defaults apply */ }
  const prefix   = typeof body.prefix === 'string' && body.prefix.trim() ? body.prefix.trim() : 'saas/app/api'
  // Pre-call size check — clamp into [1, tier ceiling] to bound model cost.
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
          prefix, maxFiles,
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

        // Immutable full-payload snapshot for instant rehydration (best-effort:
        // findings are already persisted normalized in audit_findings).
        const payload = { runId, prefix, filesScanned: result.filesScanned, findingsCount: result.findings.length, findings: result.findings }
        await admin.from('audit_logs').insert({ run_id: runId, user_id: ctx.userId, payload })

        send({ phase: 'DONE', ok: true, ...payload })
        controller.close()
      } catch (e: unknown) {
        send({ phase: 'ERROR', error: e instanceof Error ? e.message : 'Audit run failed.' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  })
}
