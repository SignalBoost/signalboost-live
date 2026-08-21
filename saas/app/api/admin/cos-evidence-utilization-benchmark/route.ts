import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import {
  COS_EVIDENCE_UTILIZATION_BENCHMARK,
  evidenceUtilizationDomains,
} from '@/lib/ai/cos/evidenceUtilizationBenchmark'
import { ensureLocalInferenceRuntimeReady, withRunpodWakePermission } from '@/lib/ai/local-inference'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'
import type { RunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_CASES_PER_RUN = 2
const START_NEXT_CASE_CUTOFF_MS = 150_000
const STALE_RUN_MS = 10 * 60_000
const errorText = (value: unknown): string => value instanceof Error
  ? value.message
  : typeof value === 'string'
    ? value
    : JSON.stringify(value) || String(value ?? 'Unknown benchmark error')

async function reconcileStaleRuns(db: NonNullable<ReturnType<typeof cosServiceDb>>) {
  const cutoff = new Date(Date.now() - STALE_RUN_MS).toISOString()
  await db.from('cos_evidence_utilization_benchmark_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: 'Evidence-utilization benchmark run expired before completion; retry resumes from actual completed attempts.',
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  await reconcileStaleRuns(db)

  const [runs, results] = await Promise.all([
    db.from('cos_evidence_utilization_benchmark_runs')
      .select('id,started_at,completed_at,requested_limit,attempted,passed,status,error')
      .order('started_at', { ascending: false })
      .limit(20),
    db.from('cos_evidence_utilization_benchmark_results')
      .select('run_id,case_id,domain,passed,reasons,turn_id,latency_ms,created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (runs.error || results.error) return NextResponse.json({ error: runs.error?.message ?? results.error?.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    suiteSize: COS_EVIDENCE_UTILIZATION_BENCHMARK.length,
    domains: evidenceUtilizationDomains(),
    maxCasesPerRun: MAX_CASES_PER_RUN,
    runs: runs.data ?? [],
    results: results.data ?? [],
    note: 'This controlled suite is separate from the six private capability-acceptance cases. It exists to accumulate like-for-like retrieval, source-use, latency and outcome cohorts.',
  })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const limit = Math.max(1, Math.min(MAX_CASES_PER_RUN, Math.floor(Number(body.limit) || MAX_CASES_PER_RUN)))
  const completedRuns = await db.from('cos_evidence_utilization_benchmark_runs')
    .select('attempted')
    .eq('status', 'completed')
    .limit(5000)
  if (completedRuns.error) return NextResponse.json({ error: completedRuns.error.message }, { status: 500 })

  const completedAttempts = (completedRuns.data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.attempted) || 0), 0)
  const start = completedAttempts % COS_EVIDENCE_UTILIZATION_BENCHMARK.length
  const selected = [
    ...COS_EVIDENCE_UTILIZATION_BENCHMARK.slice(start),
    ...COS_EVIDENCE_UTILIZATION_BENCHMARK.slice(0, start),
  ].slice(0, limit)

  const run = await db.from('cos_evidence_utilization_benchmark_runs')
    .insert({ requested_limit: limit })
    .select('id')
    .single()
  if (run.error || !run.data) return NextResponse.json({ error: run.error?.message ?? 'Could not create utilization benchmark run.' }, { status: 500 })

  const wakePermission: RunpodWakePermission = {
    allowed: true,
    source: 'user_interactive',
    interactionId: null,
    issuedAtMs: null,
    ageMs: null,
    reason: 'owner_authenticated_evidence_utilization_benchmark',
  }

  const runStartedAt = Date.now()
  let attempted = 0
  let passed = 0
  let stoppedEarlyForBudget = false
  let blockedVerdict: string | null = null
  let blockedSummary = ''
  try {
    await withRunpodWakePermission(wakePermission, async () => {
      await ensureLocalInferenceRuntimeReady().catch(error => {
        console.warn('[cos-evidence-utilization-benchmark] readiness warning:', errorText(error).slice(0, 600))
      })

      const probe = await probeReasoner()
      if (probe.verdict !== 'ok') {
        blockedVerdict = probe.verdict
        blockedSummary = probe.summary.slice(0, 1200)
        return
      }

      for (let index = 0; index < selected.length; index += 1) {
        if (index > 0 && Date.now() - runStartedAt >= START_NEXT_CASE_CUTOFF_MS) {
          stoppedEarlyForBudget = true
          break
        }
        const test = selected[index]
        attempted += 1
        try {
          const outcome = await runPrivateCapabilityCase(test, {
            outcomeSource: `evidence_utilization_benchmark:${test.id}`,
          })
          if (outcome.score.passed) passed += 1
          const inserted = await db.from('cos_evidence_utilization_benchmark_results').insert({
            run_id: run.data.id,
            case_id: test.id,
            domain: test.domain,
            passed: outcome.score.passed,
            reasons: outcome.score.reasons,
            turn_id: outcome.turnId,
            response_excerpt: outcome.replyExcerpt,
            latency_ms: outcome.latencyMs,
          })
          if (inserted.error) throw inserted.error
        } catch (error) {
          const message = errorText(error).slice(0, 1200)
          const inserted = await db.from('cos_evidence_utilization_benchmark_results').insert({
            run_id: run.data.id,
            case_id: test.id,
            domain: test.domain,
            passed: false,
            reasons: ['case_execution_failed', message],
            turn_id: null,
            response_excerpt: '',
            latency_ms: 0,
          })
          if (inserted.error) throw inserted.error
        }
      }
    })

    if (blockedVerdict) {
      const error = `Reasoner unavailable (${blockedVerdict}) — no utilization cases were scored. ${blockedSummary}`
      await db.from('cos_evidence_utilization_benchmark_runs').update({
        status: 'failed', completed_at: new Date().toISOString(), attempted: 0, passed: 0, error: error.slice(0, 2000),
      }).eq('id', run.data.id)
      return NextResponse.json({ ok: false, blocked: true, runId: run.data.id, verdict: blockedVerdict, error }, { status: 503 })
    }

    await db.from('cos_evidence_utilization_benchmark_runs').update({
      status: 'completed', completed_at: new Date().toISOString(), attempted, passed,
      error: stoppedEarlyForBudget ? 'Stopped before starting another case to preserve the 300-second route budget; the next run resumes from actual attempted cases.' : null,
    }).eq('id', run.data.id)

    return NextResponse.json({
      ok: true,
      runId: run.data.id,
      requested: limit,
      attempted,
      passed,
      passRate: attempted ? passed / attempted : 0,
      stoppedEarlyForBudget,
      nextOffset: ((start + attempted) % COS_EVIDENCE_UTILIZATION_BENCHMARK.length),
      suiteSize: COS_EVIDENCE_UTILIZATION_BENCHMARK.length,
    })
  } catch (error) {
    const message = errorText(error).slice(0, 2000)
    await db.from('cos_evidence_utilization_benchmark_runs').update({
      status: 'failed', completed_at: new Date().toISOString(), attempted, passed, error: message,
    }).eq('id', run.data.id)
    return NextResponse.json({ ok: false, runId: run.data.id, error: message }, { status: 500 })
  }
}
