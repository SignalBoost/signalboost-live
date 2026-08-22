import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { attachTurnOutcome } from '@/lib/ai/cos/turnExperienceStore'
import { ensureLocalInferenceRuntimeReady, withRunpodWakePermission } from '@/lib/ai/local-inference'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import { selectCosReasoningWorkerRole } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { MINIMUM_VERIFIED_OUTCOMES_PER_CANDIDATE } from '@/lib/ai/cos/reasoningOutcomeProfile'
import type { RunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'
import {
  COS_COMPARISON_ROLES,
  MAX_REASONING_COMPARISON_CANDIDATES,
  MAX_REASONING_COMPARISON_CASES,
  MAX_REASONING_COMPARISON_EVALUATIONS,
  normalizeReasoningComparisonCandidates,
  summarizeReasoningComparison,
} from '@/lib/ai/cos/reasoningComparison'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const COMPARISON_PROBE_TIMEOUT_MS = 90_000
const PRIVATE_DIVERSE_SUITE_ORIGIN = 'controlled-comparison-private-v1'
const terms = (value: unknown) => Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []
const errorText = (value: unknown): string => value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value) || String(value ?? 'Unknown comparison error')

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const [cases, runs, results] = await Promise.all([
    db.from('cos_capability_benchmark_cases')
      .select('id,track,prompt,active,created_at,origin,difficulty_score')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(200),
    db.from('cos_reasoning_comparison_runs')
      .select('id,case_id,candidate_roles,started_at,completed_at,attempted,verified,passed,status,error')
      .order('started_at', { ascending: false })
      .limit(40),
    db.from('cos_reasoning_comparison_results')
      .select('run_id,case_id,track,candidate_id,worker_role,reasoner_label,passed,reasons,turn_id,latency_ms,verified_outcome_recorded,created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  if (cases.error || runs.error || results.error) {
    return NextResponse.json({ error: cases.error?.message ?? runs.error?.message ?? results.error?.message }, { status: 500 })
  }

  const resultRows = results.data ?? []
  const turnIds = [...new Set(resultRows.map((row: any) => String(row.turn_id || '')).filter(Boolean))]
  let metricRows: any[] = []
  if (turnIds.length) {
    const metrics = await db.from('cos_reasoning_worker_metrics')
      .select('turn_id,problem_class,worker_role,reasoner_label')
      .in('turn_id', turnIds)
    if (metrics.error) return NextResponse.json({ error: metrics.error.message }, { status: 500 })
    metricRows = metrics.data ?? []
  }
  const metricByTurn = new Map(metricRows.map((row: any) => [String(row.turn_id), row]))

  const reasoner = resolveCosReasoner()
  return NextResponse.json({
    ok: true,
    currentReasoner: reasoner.config?.label ?? null,
    roles: COS_COMPARISON_ROLES,
    limits: {
      candidatesPerRun: MAX_REASONING_COMPARISON_CANDIDATES,
      casesPerRun: MAX_REASONING_COMPARISON_CASES,
      evaluationsPerRun: MAX_REASONING_COMPARISON_EVALUATIONS,
    },
    learningGate: {
      minimumVerifiedOutcomesPerCandidate: MINIMUM_VERIFIED_OUTCOMES_PER_CANDIDATE,
    },
    privateSuiteOrigin: PRIVATE_DIVERSE_SUITE_ORIGIN,
    cases: (cases.data ?? []).map((row: any) => ({
      id: row.id,
      track: row.track,
      origin: row.origin ?? 'manual',
      difficultyScore: Number(row.difficulty_score) || 1,
      problemClass: classifyProblemClass(String(row.prompt || '')),
      suggestedRole: selectCosReasoningWorkerRole(String(row.prompt || '')).role,
      createdAt: row.created_at,
    })),
    runs: runs.data ?? [],
    results: resultRows.map((row: any) => ({
      ...row,
      problem_class: metricByTurn.get(String(row.turn_id || ''))?.problem_class ?? null,
    })),
    note: 'This endpoint never runs automatically. Each POST is an owner-triggered, billable held-out comparison. The private diverse suite exposes only case metadata, never prompt text. Phase 4 requires independently verified outcomes per worker/model candidate before learned routing may change behavior.',
  })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const body = await request.json().catch(() => ({}))
  let candidates
  try {
    candidates = normalizeReasoningComparisonCandidates(body.roles)
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorText(error) }, { status: 400 })
  }

  const requestedCaseId = String(body.caseId || '').trim().slice(0, 200)
  const cases = await db.from('cos_capability_benchmark_cases')
    .select('id,track,prompt,required_terms,forbidden_terms,requires_local_reasoning')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(200)
  if (cases.error) return NextResponse.json({ error: cases.error.message }, { status: 500 })
  const activeCases = cases.data ?? []
  const selected = requestedCaseId
    ? activeCases.find((row: any) => String(row.id) === requestedCaseId)
    : activeCases[0]
  if (!selected) return NextResponse.json({ ok: false, error: requestedCaseId ? 'Requested active held-out case was not found.' : 'No active held-out cases are available.' }, { status: 404 })

  const run = await db.from('cos_reasoning_comparison_runs').insert({
    case_id: selected.id,
    candidate_roles: candidates.map(candidate => candidate.workerRole),
  }).select('id').single()
  if (run.error || !run.data) return NextResponse.json({ error: run.error?.message ?? 'Could not create comparison run.' }, { status: 500 })

  const ownerWakePermission: RunpodWakePermission = {
    allowed: true,
    source: 'user_interactive',
    interactionId: null,
    issuedAtMs: null,
    ageMs: null,
    reason: 'owner_authenticated_reasoning_comparison',
  }

  const resultRows: Array<{ candidateId: string; passed: boolean; verifiedOutcomeRecorded: boolean }> = []
  try {
    return await withRunpodWakePermission(ownerWakePermission, async () => {
      try {
        await ensureLocalInferenceRuntimeReady()
      } catch (error) {
        const message = `Reasoner readiness failed: ${errorText(error)}`.slice(0, 1600)
        await db.from('cos_reasoning_comparison_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: message }).eq('id', run.data.id)
        return NextResponse.json({ ok: false, runId: run.data.id, error: message }, { status: 503 })
      }

      const probe = await probeReasoner({ completionTimeoutMs: COMPARISON_PROBE_TIMEOUT_MS })
      if (probe.verdict !== 'ok') {
        const message = `Reasoner unavailable (${probe.verdict}) — no comparison outcomes were recorded. ${probe.summary}`.slice(0, 2000)
        await db.from('cos_reasoning_comparison_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: message }).eq('id', run.data.id)
        return NextResponse.json({ ok: false, runId: run.data.id, blocked: true, verdict: probe.verdict, error: message }, { status: 503 })
      }

      const benchmarkCase = {
        id: String(selected.id),
        track: String(selected.track),
        prompt: String(selected.prompt),
        requiredTerms: terms(selected.required_terms),
        forbiddenTerms: terms(selected.forbidden_terms),
        requiresProvenance: true,
        requiresLocalReasoning: Boolean(selected.requires_local_reasoning),
      }

      for (const candidate of candidates) {
        let passed = false
        let reasons: string[] = []
        let turnId: string | null = null
        let latencyMs = 0
        let verifiedOutcomeRecorded = false
        let reasonerLabel: string | null = null
        try {
          const outcome = await runPrivateCapabilityCase(benchmarkCase, {
            attachOutcome: false,
            outcomeSource: `reasoning_comparison:${run.data.id}:${candidate.id}`,
            evaluation: {
              source: 'controlled_comparison',
              runId: run.data.id,
              candidateId: candidate.id,
              workerRole: candidate.workerRole,
            },
          })
          passed = outcome.score.passed
          reasons = outcome.score.reasons
          turnId = outcome.turnId ?? null
          latencyMs = outcome.latencyMs
          reasonerLabel = resolveCosReasoner().config?.label ?? null

          const validLocalExecution = Boolean(
            turnId
            && Boolean(outcome.provenance.localModelInvoked)
            && !Boolean(outcome.provenance.externalAiInvoked),
          )
          if (validLocalExecution && turnId) {
            verifiedOutcomeRecorded = await attachTurnOutcome(turnId, {
              verifiedSuccess: passed,
              repairNeeded: !passed,
              escalated: !outcome.handled,
              source: `reasoning_comparison:${selected.track}:${candidate.workerRole}`,
            })
          }
          if (!verifiedOutcomeRecorded) reasons = [...reasons, 'verified_outcome_not_recorded']
        } catch (error) {
          reasons = ['candidate_execution_failed', errorText(error).slice(0, 1000)]
        }

        const inserted = await db.from('cos_reasoning_comparison_results').insert({
          run_id: run.data.id,
          case_id: selected.id,
          track: selected.track,
          candidate_id: candidate.id,
          worker_role: candidate.workerRole,
          reasoner_label: reasonerLabel,
          passed,
          reasons,
          turn_id: turnId,
          latency_ms: Math.max(0, latencyMs),
          verified_outcome_recorded: verifiedOutcomeRecorded,
        })
        if (inserted.error) throw inserted.error
        resultRows.push({ candidateId: candidate.id, passed, verifiedOutcomeRecorded })
      }

      const summary = summarizeReasoningComparison(resultRows)
      await db.from('cos_reasoning_comparison_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        attempted: summary.attempted,
        verified: summary.verified,
        passed: summary.passed,
      }).eq('id', run.data.id)

      return NextResponse.json({
        ok: true,
        runId: run.data.id,
        caseId: selected.id,
        candidates,
        currentReasoner: resolveCosReasoner().config?.label ?? null,
        summary,
        note: 'Only locally executed candidates with a durable verified outcome can teach Phase 4. Failed infrastructure or external fallback does not become negative capability evidence.',
      })
    })
  } catch (error) {
    const message = errorText(error).slice(0, 2000)
    const summary = summarizeReasoningComparison(resultRows)
    await db.from('cos_reasoning_comparison_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      attempted: summary.attempted,
      verified: summary.verified,
      passed: summary.passed,
      error: message,
    }).eq('id', run.data.id)
    return NextResponse.json({ ok: false, runId: run.data.id, error: message, summary }, { status: 500 })
  }
}
