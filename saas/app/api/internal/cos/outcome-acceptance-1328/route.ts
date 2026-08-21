import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { COS_EVIDENCE_UTILIZATION_BENCHMARK } from '@/lib/ai/cos/evidenceUtilizationBenchmark'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CASE_ID = 'sre-tenant-500s'

function isProtectedImmutableProductionRequest(request: NextRequest): boolean {
  if (process.env.VERCEL_ENV !== 'production') return false
  const deploymentHost = String(process.env.VERCEL_URL || '').trim().toLowerCase()
  const requestHost = String(request.headers.get('host') || '').trim().toLowerCase()
  return Boolean(deploymentHost && requestHost === deploymentHost && request.nextUrl.searchParams.get('run') === '1328')
}

export async function GET(request: NextRequest) {
  // This one-shot acceptance surface is intentionally reachable only through the
  // immutable Vercel production deployment hostname, which remains behind Vercel
  // Deployment Protection. The public custom domain and aliases are rejected.
  if (!isProtectedImmutableProductionRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404 })
  }

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const existing = await db
    .from('cos_evidence_utilization_benchmark_results')
    .select('run_id,case_id,domain,passed,reasons,turn_id,latency_ms,created_at')
    .eq('case_id', CASE_ID)
    .not('turn_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 })
  if (existing.data?.turn_id) {
    const outcome = await db
      .from('cos_turn_outcomes')
      .select('turn_id,repair_needed,escalated,user_feedback,verified_success,outcome_at,outcome_source,updated_at')
      .eq('turn_id', existing.data.turn_id)
      .maybeSingle()
    return NextResponse.json({
      ok: true,
      alreadyComplete: true,
      benchmark: existing.data,
      outcome: outcome.data ?? null,
    }, { headers: { 'cache-control': 'no-store' } })
  }

  const test = COS_EVIDENCE_UTILIZATION_BENCHMARK.find(item => item.id === CASE_ID)
  if (!test) return NextResponse.json({ ok: false, error: `Acceptance case ${CASE_ID} is missing.` }, { status: 500 })

  const run = await db
    .from('cos_evidence_utilization_benchmark_runs')
    .insert({ requested_limit: 1 })
    .select('id')
    .single()

  if (run.error || !run.data) {
    return NextResponse.json({ ok: false, error: run.error?.message ?? 'Could not create acceptance run.' }, { status: 500 })
  }

  try {
    const result = await runPrivateCapabilityCase(test, {
      outcomeSource: `evidence_utilization_benchmark:${test.id}`,
    })

    if (!result.turnId) throw new Error('Acceptance case completed without a reasoner turn_id.')

    const inserted = await db.from('cos_evidence_utilization_benchmark_results').insert({
      run_id: run.data.id,
      case_id: test.id,
      domain: test.domain,
      passed: result.score.passed,
      reasons: result.score.reasons,
      turn_id: result.turnId,
      response_excerpt: result.replyExcerpt,
      latency_ms: result.latencyMs,
    })
    if (inserted.error) throw inserted.error

    const finished = await db.from('cos_evidence_utilization_benchmark_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      attempted: 1,
      passed: result.score.passed ? 1 : 0,
      error: null,
    }).eq('id', run.data.id)
    if (finished.error) throw finished.error

    const outcome = await db
      .from('cos_turn_outcomes')
      .select('turn_id,repair_needed,escalated,user_feedback,verified_success,outcome_at,outcome_source,updated_at')
      .eq('turn_id', result.turnId)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      alreadyComplete: false,
      runId: run.data.id,
      caseId: test.id,
      domain: test.domain,
      passed: result.score.passed,
      reasons: result.score.reasons,
      turnId: result.turnId,
      latencyMs: result.latencyMs,
      provenance: result.provenance,
      outcome: outcome.data ?? null,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.from('cos_evidence_utilization_benchmark_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      attempted: 0,
      passed: 0,
      error: message.slice(0, 2000),
    }).eq('id', run.data.id)
    return NextResponse.json({ ok: false, runId: run.data.id, error: message }, { status: 500 })
  }
}
