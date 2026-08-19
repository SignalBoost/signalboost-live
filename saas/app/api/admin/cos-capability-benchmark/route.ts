// saas/app/api/admin/cos-capability-benchmark/route.ts
//
// Private held-out capability benchmark. Owner-only. Cache and external-AI answers do not count.
//
// THE RUNNER MUST WAKE THE REASONER BEFORE IT SCORES ANYTHING, and that wake must be granted
// EXPLICITLY — this route cannot rely on ensureLocalInferenceRuntimeReady()'s default gate.
//
// That gate reads request-scoped permission from an AsyncLocalStorage context that only
// /api/cos-browser and /api/support ever populate (a same-origin browser POST, or an explicit
// user-interaction token). Its own comment states the reasoning: wake permission is a COST
// boundary, not an authentication boundary — it exists to stop cron jobs, background workers and
// server-to-server calls from waking a paid-by-the-hour GPU on their own. A server route calling
// ensureLocalInferenceRuntimeReady() directly, with nothing populating that context, is exactly a
// "background_or_untrusted" caller and the gate throws every time, regardless of whether the pod is
// actually asleep. AN EARLIER VERSION OF THIS FIX DID EXACTLY THAT and would have kept reporting
// reasonerReady:false forever, silently, because the failure looks identical to a pod that refused
// to wake for other reasons.
//
// The fix here is not to route around the gate — it is to use it correctly. requireOwner() already
// supplies a stronger authorization than the origin check the gate approximates for anonymous
// browser traffic, so an owner-authenticated admin action is exactly the kind of explicit,
// person-supplied authorization the whole wake policy is built to require. This constructs that
// permission directly and grants it only for the duration of this request.
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { ensureLocalInferenceRuntimeReady, withRunpodWakePermission } from '@/lib/ai/local-inference'
import type { RunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_CASES_PER_RUN = 2
const STALE_RUN_MS = 10 * 60_000
const terms = (value: unknown) => Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []
const errorText = (value: unknown): string => value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value) || String(value ?? 'Unknown benchmark error')

async function reconcileStaleRuns(db: NonNullable<ReturnType<typeof cosServiceDb>>) {
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString()
  await db.from('cos_capability_benchmark_runs')
    .update({ status: 'failed', completed_at: new Date().toISOString(), error: 'Benchmark run expired before completion; retry uses a bounded two-case batch.' })
    .eq('status', 'running').lt('started_at', cutoff)
}

export async function GET() {
  const guard = await requireOwner(); if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb(); if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  await reconcileStaleRuns(db)
  const [cases, runs] = await Promise.all([
    db.from('cos_capability_benchmark_cases').select('id,track,active,created_at').order('created_at', { ascending: false }).limit(200),
    db.from('cos_capability_benchmark_runs').select('id,started_at,completed_at,attempted,passed,status,error').order('started_at', { ascending: false }).limit(20),
  ])
  if (cases.error || runs.error) return NextResponse.json({ error: cases.error?.message ?? runs.error?.message }, { status: 500 })
  return NextResponse.json({ ok: true, maxCasesPerRun: MAX_CASES_PER_RUN, cases: cases.data ?? [], runs: runs.data ?? [] })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner(); if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb(); if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const limit = Math.max(1, Math.min(MAX_CASES_PER_RUN, Math.floor(Number(body.limit) || MAX_CASES_PER_RUN)))
  const cases = await db.from('cos_capability_benchmark_cases').select('id,track,prompt,required_terms,forbidden_terms,requires_local_reasoning').eq('active', true).order('created_at', { ascending: true }).limit(200)
  if (cases.error) return NextResponse.json({ error: cases.error.message }, { status: 500 })
  const completedRuns = await db.from('cos_capability_benchmark_runs').select('id').eq('status', 'completed').limit(2000)
  if (completedRuns.error) return NextResponse.json({ error: completedRuns.error.message }, { status: 500 })
  const activeCases = cases.data ?? []
  const start = activeCases.length ? ((completedRuns.data?.length ?? 0) * limit) % activeCases.length : 0
  const selected = [...activeCases.slice(start), ...activeCases.slice(0, start)].slice(0, limit)
  const run = await db.from('cos_capability_benchmark_runs').insert({ requested_limit: limit }).select('id').single()
  if (run.error || !run.data) return NextResponse.json({ error: run.error?.message ?? 'Could not create benchmark run.' }, { status: 500 })

  const ownerWakePermission: RunpodWakePermission = {
    allowed: true,
    source: 'user_interactive',
    interactionId: null,
    issuedAtMs: null,
    ageMs: null,
    reason: 'owner_authenticated_admin_action',
  }

  let reasonerReady = true
  let reasonerError = ''
  let passed = 0
  let attempted = 0
  try {
    await withRunpodWakePermission(ownerWakePermission, async () => {
      try {
        await ensureLocalInferenceRuntimeReady()
      } catch (error) {
        reasonerReady = false
        reasonerError = errorText(error).slice(0, 600)
        console.warn('[cos-capability-benchmark] reasoner readiness failed; results will reflect run conditions, not capability:', reasonerError)
      }

      for (const row of selected) {
        attempted += 1
        try {
          const outcome = await runPrivateCapabilityCase({ id: String(row.id), track: String(row.track), prompt: String(row.prompt), requiredTerms: terms(row.required_terms), forbiddenTerms: terms(row.forbidden_terms), requiresProvenance: true, requiresLocalReasoning: Boolean(row.requires_local_reasoning) })
          if (outcome.score.passed) passed += 1
          const inserted = await db.from('cos_capability_benchmark_results').insert({ run_id: run.data.id, case_id: row.id, track: row.track, passed: outcome.score.passed, reasons: outcome.score.reasons, response_excerpt: outcome.replyExcerpt, response_source: outcome.provenance.responseSource, local_model_invoked: outcome.provenance.localModelInvoked, external_ai_invoked: outcome.provenance.externalAiInvoked, latency_ms: outcome.latencyMs })
          if (inserted.error) throw inserted.error
        } catch (error) {
          const message = errorText(error).slice(0, 1200)
          const inserted = await db.from('cos_capability_benchmark_results').insert({ run_id: run.data.id, case_id: row.id, track: row.track, passed: false, reasons: ['case_execution_failed', message], response_excerpt: '', response_source: 'none', local_model_invoked: false, external_ai_invoked: false, latency_ms: 0 })
          if (inserted.error) throw inserted.error
        }
      }
    })
    await db.from('cos_capability_benchmark_runs').update({ status: 'completed', completed_at: new Date().toISOString(), attempted, passed }).eq('id', run.data.id)
    return NextResponse.json({ ok: true, runId: run.data.id, attempted, passed, passRate: attempted ? passed / attempted : 0, reasonerReady, reasonerError: reasonerError || undefined })
  } catch (error) {
    const message = errorText(error).slice(0, 2000)
    await db.from('cos_capability_benchmark_runs').update({ status: 'failed', completed_at: new Date().toISOString(), attempted, passed, error: message }).eq('id', run.data.id)
    return NextResponse.json({ ok: false, runId: run.data.id, error: message, reasonerReady, reasonerError: reasonerError || undefined }, { status: 500 })
  }
}