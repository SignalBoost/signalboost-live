import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'
import { evaluateChiefOfStaffReliability } from '@/lib/ai/cos/chiefOfStaffReliability'
import {
  CHIEF_OF_STAFF_ACCEPTANCE_CASES,
  evaluateChiefOfStaffAcceptanceCase,
} from '@/lib/ai/cos/chiefOfStaffAcceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CASE_IDS: Record<string, string> = {
  'instruction-scope': 'c05f0001-0000-4000-8000-000000000001',
  'evidence-boundary': 'c05f0001-0000-4000-8000-000000000002',
  'routine-follow-through': 'c05f0001-0000-4000-8000-000000000003',
  'truthful-status': 'c05f0001-0000-4000-8000-000000000004',
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error ?? 'Unknown acceptance error')).slice(0, 1600)

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })
  const runs = await db.from('cos_chief_of_staff_acceptance_runs')
    .select('id,profile,status,started_at,completed_at,gate_passed,observed_cases,dimensions,failures,error')
    .order('started_at', { ascending: false }).limit(20)
  if (runs.error) return NextResponse.json({ ok: false, error: runs.error.message }, { status: 500 })
  const runIds = (runs.data ?? []).map(row => row.id)
  const results = runIds.length
    ? await db.from('cos_chief_of_staff_acceptance_results')
      .select('id,run_id,case_key,title,passed,verdicts,response_source,local_model_invoked,external_ai_invoked,fresh_execution,provenance_recorded,latency_ms,created_at')
      .in('run_id', runIds).order('created_at', { ascending: true })
    : { data: [], error: null }
  if (results.error) return NextResponse.json({ ok: false, error: results.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, requiredCases: 4, runs: runs.data ?? [], results: results.data ?? [] })
}

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const created = await db.from('cos_chief_of_staff_acceptance_runs').insert({}).select('id').single()
  if (created.error || !created.data) return NextResponse.json({ ok: false, error: created.error?.message ?? 'Could not create acceptance run.' }, { status: 500 })
  const runId = String(created.data.id)

  try {
    const probe = await probeReasoner({ completionTimeoutMs: 90_000 })
    if (probe.verdict !== 'ok') throw new Error(`Reasoner unavailable (${probe.verdict}): ${probe.summary}`)

    const observations = []
    for (const test of CHIEF_OF_STAFF_ACCEPTANCE_CASES) {
      try {
        const outcome = await runPrivateCapabilityCase({
          id: CASE_IDS[test.key],
          track: 'chief_of_staff_acceptance',
          prompt: test.prompt,
          requiredTerms: [],
          forbiddenTerms: [],
          requiresProvenance: true,
          requiresLocalReasoning: true,
        }, { attachOutcome: false, outcomeSource: 'chief_of_staff_acceptance' })
        const freshExecution = outcome.provenance.localModelInvoked === true
          && !outcome.provenance.externalAiInvoked
          && !['semantic_cache', 'semantic_similarity'].includes(String(outcome.provenance.responseSource))
        const provenanceRecorded = Boolean(outcome.turnId)
        const observation = evaluateChiefOfStaffAcceptanceCase({ runId, test, reply: outcome.replyExcerpt, freshExecution, provenanceRecorded })
        observations.push(observation)
        const passed = Object.values(observation.verdicts).every(verdict => verdict.passed)
          && freshExecution && provenanceRecorded
        const inserted = await db.from('cos_chief_of_staff_acceptance_results').insert({
          run_id: runId,
          case_key: test.key,
          title: test.title,
          passed,
          verdicts: observation.verdicts,
          response_excerpt: outcome.replyExcerpt,
          response_source: outcome.provenance.responseSource,
          local_model_invoked: outcome.provenance.localModelInvoked,
          external_ai_invoked: outcome.provenance.externalAiInvoked,
          fresh_execution: freshExecution,
          provenance_recorded: provenanceRecorded,
          turn_id: outcome.turnId,
          latency_ms: outcome.latencyMs,
        })
        if (inserted.error) throw inserted.error
      } catch (error) {
        const observation = evaluateChiefOfStaffAcceptanceCase({ runId, test, reply: '', freshExecution: false, provenanceRecorded: false })
        observations.push(observation)
        const inserted = await db.from('cos_chief_of_staff_acceptance_results').insert({
          run_id: runId,
          case_key: test.key,
          title: test.title,
          passed: false,
          verdicts: observation.verdicts,
          response_excerpt: `Execution failed: ${errorText(error)}`,
          response_source: 'none',
          local_model_invoked: false,
          external_ai_invoked: false,
          fresh_execution: false,
          provenance_recorded: false,
          latency_ms: 0,
        })
        if (inserted.error) throw inserted.error
      }
    }

    const report = evaluateChiefOfStaffReliability(observations)
    const updated = await db.from('cos_chief_of_staff_acceptance_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      gate_passed: report.gatePassed,
      observed_cases: report.observedCases,
      dimensions: report.dimensions,
      failures: report.failures,
    }).eq('id', runId)
    if (updated.error) throw updated.error
    return NextResponse.json({ ok: true, runId, report })
  } catch (error) {
    const message = errorText(error)
    await db.from('cos_chief_of_staff_acceptance_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: message }).eq('id', runId)
    return NextResponse.json({ ok: false, runId, error: message }, { status: 503 })
  }
}
