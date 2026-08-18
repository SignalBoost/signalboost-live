import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const terms = (value: unknown) => Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []

export async function GET() {
  const guard = await requireOwner(); if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb(); if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  const [cases, runs] = await Promise.all([
    db.from('cos_capability_benchmark_cases').select('id,track,active,created_at').order('created_at', { ascending: false }).limit(200),
    db.from('cos_capability_benchmark_runs').select('id,started_at,completed_at,attempted,passed,status,error').order('started_at', { ascending: false }).limit(20),
  ])
  if (cases.error || runs.error) return NextResponse.json({ error: cases.error?.message ?? runs.error?.message }, { status: 500 })
  return NextResponse.json({ ok: true, cases: cases.data ?? [], runs: runs.data ?? [] })
}

export async function POST(request: NextRequest) {
  const guard = await requireOwner(); if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb(); if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  const body = await request.json().catch(() => ({})); const limit = Math.max(1, Math.min(20, Math.floor(Number(body.limit) || 10)))
  const selected = await db.from('cos_capability_benchmark_cases').select('id,track,prompt,required_terms,forbidden_terms,requires_local_reasoning').eq('active', true).order('created_at', { ascending: true }).limit(limit)
  if (selected.error) return NextResponse.json({ error: selected.error.message }, { status: 500 })
  const run = await db.from('cos_capability_benchmark_runs').insert({ requested_limit: limit }).select('id').single()
  if (run.error || !run.data) return NextResponse.json({ error: run.error?.message ?? 'Could not create benchmark run.' }, { status: 500 })
  try {
    let passed = 0
    for (const row of selected.data ?? []) {
      const outcome = await runPrivateCapabilityCase({ id: String(row.id), track: String(row.track), prompt: String(row.prompt), requiredTerms: terms(row.required_terms), forbiddenTerms: terms(row.forbidden_terms), requiresProvenance: true, requiresLocalReasoning: Boolean(row.requires_local_reasoning) })
      if (outcome.score.passed) passed += 1
      const inserted = await db.from('cos_capability_benchmark_results').insert({ run_id: run.data.id, case_id: row.id, track: row.track, passed: outcome.score.passed, reasons: outcome.score.reasons, response_source: outcome.provenance.responseSource, local_model_invoked: outcome.provenance.localModelInvoked, external_ai_invoked: outcome.provenance.externalAiInvoked, latency_ms: outcome.latencyMs })
      if (inserted.error) throw inserted.error
    }
    const attempted = selected.data?.length ?? 0
    await db.from('cos_capability_benchmark_runs').update({ status: 'completed', completed_at: new Date().toISOString(), attempted, passed }).eq('id', run.data.id)
    return NextResponse.json({ ok: true, runId: run.data.id, attempted, passed, passRate: attempted ? passed / attempted : 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.from('cos_capability_benchmark_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: message.slice(0, 2000) }).eq('id', run.data.id)
    return NextResponse.json({ ok: false, runId: run.data.id, error: message }, { status: 500 })
  }
}
