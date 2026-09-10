// saas/app/api/hub/operator/audit/route.ts
// Primary orchestration endpoint for the Audit Project microservice.
// Streams NDJSON phase events as the run progresses. Canonical owner audits are
// also a Self-Healing Supervisor input: engine failures schedule an Audit-system
// repair, while verified findings are durably authorized and remediated through
// the governed Audit PR/CI/merge lifecycle without another owner click.

import { after, NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { runAudit } from '@/lib/audit/runner'
import { checkScanQuota, clampScanSize } from '@/lib/audit/scanThrottle'
import { collectProviderTemplateSnapshot } from '@/lib/audit/providerTemplateSnapshot'
import { writeSnapshot } from '@/lib/audit/snapshotCache'
import { normalizeReportLang, reportLangFromCookie } from '@/lib/i18n/reportLanguage'
import { preflightAuditCos } from '@/lib/audit/modelRouter'
import {
  authorizeOwnedAuditFindings,
  enqueueOwnedAuditEngineRepair,
  isCanonicalOwnedAuditTarget,
  runAuthorizedOwnedAuditFindingsRemediation,
} from '@/self-healing-host/owned-audit-self-healing'

export const runtime     = 'nodejs'
export const maxDuration = 800

type PostAuditTask =
  | { kind: 'findings'; runId: string; actorUserId: string }
  | { kind: 'engine_failure'; runId: string; actorUserId: string; prefix: string; error: string }
  | null

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
  const ownedAutoRepair = Boolean(ctx.isOwner && isCanonicalOwnedAuditTarget(prefix))

  let resolvePostAuditTask: (task: PostAuditTask) => void = () => {}
  const postAuditTask = new Promise<PostAuditTask>((resolve) => { resolvePostAuditTask = resolve })
  let postAuditTaskSettled = false
  const settlePostAuditTask = (task: PostAuditTask) => {
    if (postAuditTaskSettled) return
    postAuditTaskSettled = true
    resolvePostAuditTask(task)
  }

  // Register background work while the request context is alive. The deferred task
  // is resolved by the stream only after the run has durable Production evidence.
  after(async () => {
    const task = await postAuditTask
    if (!task) return
    if (task.kind === 'findings') {
      await runAuthorizedOwnedAuditFindingsRemediation({
        admin,
        runId: task.runId,
        actorUserId: task.actorUserId,
      })
      return
    }
    await enqueueOwnedAuditEngineRepair({
      admin,
      runId: task.runId,
      actorUserId: task.actorUserId,
      prefix: task.prefix,
      error: task.error,
    })
  })

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(enc.encode(JSON.stringify(obj) + '\n')) } catch { /* client gone */ }
      }
      let runId = ''
      try {
        const pre = await preflightAuditCos()
        if ('error' in pre) {
          settlePostAuditTask(null)
          send({ phase: 'ERROR', error: `Preflight failed: ${pre.error}` })
          controller.close()
          return
        }

        send({ phase: 'SCAN_TARGET', prefix })

        const started = await admin.from('audit_runs').insert({ status: 'running', prefix, created_by: ctx.userId }).select('id').single()
        if (started.error || !started.data) {
          settlePostAuditTask(null)
          send({ phase: 'ERROR', error: `Could not open audit run: ${started.error?.message || 'insert failed'}` })
          controller.close()
          return
        }
        runId = started.data.id as string

        const result = await runAudit({
          url: prefix,
          maxFiles,
          lang,
          onProgress: (done, total) => send({ phase: 'RUN_ANALYZERS', done, total }),
        })

        if (!result.ok) {
          const error = result.error || 'Audit runner failed.'
          await admin.from('audit_runs').update({ status: 'failed', error, files_scanned: 0, findings_count: 0 }).eq('id', runId)
          if (ownedAutoRepair) {
            settlePostAuditTask({ kind: 'engine_failure', runId, actorUserId: ctx.userId, prefix, error })
            send({ phase: 'ERROR', runId, error: `${error} Self-Healing Supervisor scheduled an automatic Audit-system repair.`, selfHealingScheduled: true })
          } else {
            settlePostAuditTask(null)
            send({ phase: 'ERROR', runId, error })
          }
          controller.close()
          return
        }

        send({ phase: 'GENERATE_REPORT', findings: result.findings.length })

        if (result.findings.length > 0) {
          const rows = result.findings.map(f => ({
            run_id: runId, file: f.file, severity: f.severity, category: f.category,
            title: f.title, detail: f.detail, recommendation: f.recommendation, line: f.line ?? null,
          }))
          const ins = await admin.from('audit_findings').insert(rows)
          if (ins.error) {
            const error = `findings insert: ${ins.error.message}`
            await admin.from('audit_runs').update({ status: 'failed', error }).eq('id', runId)
            if (ownedAutoRepair) {
              settlePostAuditTask({ kind: 'engine_failure', runId, actorUserId: ctx.userId, prefix, error })
              send({ phase: 'ERROR', runId, error: `Could not store findings: ${ins.error.message}. Self-Healing Supervisor scheduled an automatic Audit-system repair.`, selfHealingScheduled: true })
            } else {
              settlePostAuditTask(null)
              send({ phase: 'ERROR', runId, error: `Could not store findings: ${ins.error.message}` })
            }
            controller.close()
            return
          }
        }

        send({ phase: 'PREPARE_PRS' })

        await admin.from('audit_runs').update({
          status: 'complete', files_scanned: result.filesScanned.length,
          findings_count: result.findings.length,
          provider: pre.identity.provider,
          model: pre.identity.model,
        }).eq('id', runId)

        let finalStatus = 'complete'
        let selfHealingScheduled = false
        let selfHealingError = ''
        if (ownedAutoRepair && result.findings.length > 0) {
          const authorization = await authorizeOwnedAuditFindings({
            admin,
            runId,
            actorUserId: ctx.userId,
            prefix,
          })
          if (authorization.authorized) {
            finalStatus = 'approved'
            selfHealingScheduled = true
            settlePostAuditTask({ kind: 'findings', runId, actorUserId: ctx.userId })
          } else {
            selfHealingError = authorization.error
            settlePostAuditTask(null)
          }
        } else {
          settlePostAuditTask(null)
        }

        const payload = {
          runId,
          prefix,
          status: finalStatus,
          filesScanned: result.filesScanned,
          findingsCount: result.findings.length,
          findings: result.findings,
          narrative: result.narrative || '',
          lang,
          selfHealing: {
            source: 'self-healing-supervisor',
            scheduled: selfHealingScheduled,
            error: selfHealingError,
          },
          reasoning: {
            orchestrator: pre.identity.provider,
            runtimeProvider: pre.identity.runtimeProvider,
            reasoner: pre.identity.reasoner,
            model: pre.identity.model,
          },
        }
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
        const error = e instanceof Error ? e.message : 'Audit run failed.'
        if (runId && ownedAutoRepair) {
          settlePostAuditTask({ kind: 'engine_failure', runId, actorUserId: ctx.userId, prefix, error })
          send({ phase: 'ERROR', runId, error: `${error} Self-Healing Supervisor scheduled an automatic Audit-system repair.`, selfHealingScheduled: true })
        } else {
          settlePostAuditTask(null)
          send({ phase: 'ERROR', runId: runId || undefined, error })
        }
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
