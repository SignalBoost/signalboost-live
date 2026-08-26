// saas/app/api/admin/cos-capability-benchmark/route.ts
//
// Private held-out capability benchmark. Owner-only. Cache and external-AI answers do not count.
//
// THE RUNNER MUST WAKE THE REASONER BEFORE IT SCORES ANYTHING, and that wake must be granted
// EXPLICITLY — this route cannot rely on ensureLocalInferenceRuntimeReady()'s default gate.
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { ensureLocalInferenceRuntimeReady, withRunpodWakePermission } from '@/lib/ai/local-inference'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'
import { isPrivateCapabilityAcceptanceOrigin } from '@/lib/ai/cos/capabilityBenchmarkCohort'
import type { RunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_CASES_PER_RUN = 2
const DATA_CENTER_BENCHMARK_TRACK = 'data_center_operations'
const DATA_CENTER_MAX_CASES_PER_RUN = 1
const BENCHMARK_PROBE_TIMEOUT_MS = 90_000
const STALE_RUN_MS = 10 * 60_000
const terms = (value: unknown) => Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []
const errorText = (value: unknown): string => value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value) || String(value ?? 'Unknown benchmark error')
const cleanTrack = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanCaseIds(value: unknown, maxCases: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => String(item || '').trim()).filter(item => uuidPattern.test(item)))].slice(0, maxCases)
}

async function reconcileStaleRuns(db: NonNullable<ReturnType<typeof cosServiceDb>>) {
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString()
  await db.from('cos_capability_benchmark_runs')
    .update({ status: 'failed', completed_at: new Date().toISOString(), error: 'Benchmark run expired before completion; retry uses a bounded benchmark batch.' })
    .eq('status', 'running').lt('started_at', cutoff)
}

export async function GET() {
  const guard = await requireOwner(); if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb(); if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  await reconcileStaleRuns(db)
  const [cases, runs] = await Promise.all([
    db.from('cos_capability_benchmark_cases').select('id,track,active,origin,evaluation_profile,created_at').order('created_at', { ascending: false }).limit(200),
    db.from('cos_capability_benchmark_runs').select('id,started_at,completed_at,attempted,passed,status,error').order('started_at', { ascending: false }).limit(20),
  ])
  if (cases.error || runs.error) return NextResponse.json({ error: cases.error?.message ?? runs.error?.message }, { status: 500 })
  const privateCases = (cases.data ?? []).filter(row => isPrivateCapabilityAcceptanceOrigin(row.origin))
  return NextResponse.json({ ok: true, maxCasesPerRun: MAX_CASES_PER_RUN, dataCenterMaxCasesPerRun: DATA_CENTER_MAX_CASES_PER_RUN, cases: privateCases, runs: runs.data ?? [] })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner(); if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb(); if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  const body = await request.json().catch(() => ({}))
  const requestedTrack = cleanTrack(body.track)
  const maxCasesForTrack = requestedTrack === DATA_CENTER_BENCHMARK_TRACK ? DATA_CENTER_MAX_CASES_PER_RUN : MAX_CASES_PER_RUN
  const limit = Math.max(1, Math.min(maxCasesForTrack, Math.floor(Number(body.limit) || maxCasesForTrack)))
  const requestedCaseIds = cleanCaseIds(body.caseIds, maxCasesForTrack)
  const cases = await db.from('cos_capability_benchmark_cases').select('id,track,prompt,required_terms,forbidden_terms,requires_local_reasoning,origin,evaluation_profile').eq('active', true).order('created_at', { ascending: true }).limit(200)
  if (cases.error) return NextResponse.json({ error: cases.error.message }, { status: 500 })
  const completedRuns = await db.from('cos_capability_benchmark_runs').select('id').eq('status', 'completed').limit(2000)
  if (completedRuns.error) return NextResponse.json({ error: completedRuns.error.message }, { status: 500 })
  const activeCases = (cases.data ?? []).filter(row => isPrivateCapabilityAcceptanceOrigin(row.origin) && (!requestedTrack || String(row.track) === requestedTrack))
  if (!activeCases.length) return NextResponse.json({ ok: false, error: requestedTrack ? `No active private benchmark cases for track ${requestedTrack}.` : 'No active private benchmark cases.' }, { status: 404 })

  let selected = [] as typeof activeCases
  if (requestedCaseIds.length) {
    const requested = new Set(requestedCaseIds)
    selected = activeCases.filter(row => requested.has(String(row.id))).slice(0, limit)
    if (selected.length !== requestedCaseIds.length) {
      return NextResponse.json({ ok: false, error: 'One or more requested private benchmark cases are unavailable for this track.' }, { status: 404 })
    }
  } else {
    const start = ((completedRuns.data?.length ?? 0) * limit) % activeCases.length
    selected = [...activeCases.slice(start), ...activeCases.slice(0, start)].slice(0, limit)
  }

  if (selected.length > DATA_CENTER_MAX_CASES_PER_RUN && selected.some(row => String(row.track) === DATA_CENTER_BENCHMARK_TRACK)) {
    return NextResponse.json({ ok: false, error: 'Data-center private benchmark requests are limited to one case to stay within the runtime budget.' }, { status: 400 })
  }

  const run = await db.from('cos_capability_benchmark_runs').insert({ requested_limit: selected.length }).select('id').single()
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
  let blockedVerdict: string | null = null
  let blockedSummary = ''
  try {
    await withRunpodWakePermission(ownerWakePermission, async () => {
      try {
        await ensureLocalInferenceRuntimeReady()
      } catch (error) {
        reasonerReady = false
        reasonerError = errorText(error).slice(0, 600)
        console.warn('[cos-capability-benchmark] reasoner readiness failed; results will reflect run conditions, not capability:', reasonerError)
      }

      // Managed providers can legitimately exceed the general 45-second diagnostic probe while
      // still completing benchmark answers successfully. Give owner-run acceptance a larger but
      // bounded preflight window so slow healthy Qwen calls are not mislabeled as 0/0 failures.
      const probe = await probeReasoner({ completionTimeoutMs: BENCHMARK_PROBE_TIMEOUT_MS })
      if (probe.verdict !== 'ok') {
        blockedVerdict = probe.verdict
        blockedSummary = probe.summary.slice(0, 1200)
        console.warn('[cos-capability-benchmark] blocked before scoring:', blockedVerdict, blockedSummary)
        return
      }

      for (const row of selected) {
        attempted += 1
        try {
          const outcome = await runPrivateCapabilityCase({
            id: String(row.id),
            track: String(row.track),
            prompt: String(row.prompt),
            requiredTerms: terms(row.required_terms),
            forbiddenTerms: terms(row.forbidden_terms),
            requiresProvenance: true,
            requiresLocalReasoning: Boolean(row.requires_local_reasoning),
            evaluationProfile: String(row.evaluation_profile || '') || undefined,
          })
          if (outcome.score.passed) passed += 1
          const inserted = await db.from('cos_capability_benchmark_results').insert({
            run_id: run.data.id,
            case_id: row.id,
            track: row.track,
            passed: outcome.score.passed,
            reasons: outcome.score.reasons,
            response_excerpt: outcome.replyExcerpt,
            response_source: outcome.provenance.responseSource,
            local_model_invoked: outcome.provenance.localModelInvoked,
            external_ai_invoked: outcome.provenance.externalAiInvoked,
            latency_ms: outcome.latencyMs,
            turn_id: outcome.turnId,
          })
          if (inserted.error) throw inserted.error
        } catch (error) {
          const message = errorText(error).slice(0, 1200)
          const inserted = await db.from('cos_capability_benchmark_results').insert({ run_id: run.data.id, case_id: row.id, track: row.track, passed: false, reasons: ['case_execution_failed', message], response_excerpt: '', response_source: 'none', local_model_invoked: false, external_ai_invoked: false, latency_ms: 0, turn_id: null })
          if (inserted.error) throw inserted.error
        }
      }
    })

    if (blockedVerdict) {
      const blockedError = `Reasoner unavailable (${blockedVerdict}) — no cases were scored. ${blockedSummary}`
      await db.from('cos_capability_benchmark_runs').update({ status: 'failed', completed_at: new Date().toISOString(), attempted: 0, passed: 0, error: blockedError.slice(0, 2000) }).eq('id', run.data.id)
      return NextResponse.json({ ok: false, runId: run.data.id, blocked: true, verdict: blockedVerdict, error: blockedError, reasonerReady, reasonerError: reasonerError || undefined, next: 'GET /api/admin/cos-reasoner/diagnose for the full probe.' }, { status: 503 })
    }

    await db.from('cos_capability_benchmark_runs').update({ status: 'completed', completed_at: new Date().toISOString(), attempted, passed }).eq('id', run.data.id)
    return NextResponse.json({ ok: true, runId: run.data.id, track: requestedTrack || null, caseIds: selected.map(row => String(row.id)), attempted, passed, passRate: attempted ? passed / attempted : 0, reasonerReady, reasonerError: reasonerError || undefined })
  } catch (error) {
    const message = errorText(error).slice(0, 2000)
    await db.from('cos_capability_benchmark_runs').update({ status: 'failed', completed_at: new Date().toISOString(), attempted, passed, error: message }).eq('id', run.data.id)
    return NextResponse.json({ ok: false, runId: run.data.id, track: requestedTrack || null, error: message, reasonerReady, reasonerError: reasonerError || undefined }, { status: 500 })
  }
}
