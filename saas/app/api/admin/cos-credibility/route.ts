import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import { credibilityReport, fitIsotonicCalibration, type CredibilityObservation } from '@/lib/ai/cos/credibility'
import { evaluateCredibilityAnswer, provenanceMatchesAnswer, type CredibilityGoldSpec } from '@/lib/ai/cos/credibilityEvaluation'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_SUITE = 'cos-credibility-smoke-v1'
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 10

type StoredObservation = CredibilityObservation & Record<string, unknown>

function reportFromRows(rows: StoredObservation[]) {
  const observations: CredibilityObservation[] = rows.map((row) => ({
    predictedConfidence: Number(row.predictedConfidence ?? row.predicted_confidence ?? 0),
    correctness: Number(row.correctness ?? 0),
    abstained: typeof row.abstained === 'boolean' ? row.abstained : null,
    shouldAbstain: typeof row.shouldAbstain === 'boolean'
      ? row.shouldAbstain
      : typeof row.should_abstain === 'boolean'
        ? Boolean(row.should_abstain)
        : null,
    provenanceTruthful: typeof row.provenanceTruthful === 'boolean'
      ? row.provenanceTruthful
      : typeof row.provenance_truthful === 'boolean'
        ? Boolean(row.provenance_truthful)
        : null,
    actionCorrect: typeof row.actionCorrect === 'boolean'
      ? row.actionCorrect
      : typeof row.action_correct === 'boolean'
        ? Boolean(row.action_correct)
        : null,
    robustnessGroup: row.robustnessGroup ? String(row.robustnessGroup) : row.robustness_group ? String(row.robustness_group) : null,
    conclusionKey: row.conclusionKey ? String(row.conclusionKey) : row.conclusion_key ? String(row.conclusion_key) : null,
  }))
  return {
    report: credibilityReport(observations),
    calibration: fitIsotonicCalibration(observations),
  }
}

async function loadReport(suiteVersion: string, runId?: string | null) {
  const db = cosServiceDb()
  if (!db) return null
  let query = db.from('cos_credibility_observations')
    .select('predicted_confidence,correctness,abstained,should_abstain,provenance_truthful,action_correct,robustness_group,conclusion_key')
    .eq('suite_version', suiteVersion)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (runId) query = query.eq('run_id', runId)
  const result = await query
  if (result.error) throw result.error
  return reportFromRows((result.data ?? []) as unknown as StoredObservation[])
}

export async function GET(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const suiteVersion = req.nextUrl.searchParams.get('suite')?.trim() || DEFAULT_SUITE
  const runId = req.nextUrl.searchParams.get('run')?.trim() || null
  try {
    const measured = await loadReport(suiteVersion, runId)
    if (!measured) return NextResponse.json({ ok: false, error: 'COS Supabase service store is not configured.' }, { status: 503 })
    return NextResponse.json({
      ok: true,
      suiteVersion,
      runId,
      ...measured,
      calibrationReady: measured.report.sampleSize >= 100,
      note: measured.report.sampleSize >= 100
        ? 'Calibration map is measurable; validate it on a disjoint holdout set before changing live COS confidence.'
        : 'Smoke data only. Do not use this calibration map to alter live COS confidence yet.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message || 'Credibility report failed.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS Supabase service store is not configured.' }, { status: 503 })

  const body = await req.json().catch(() => ({})) as { suiteVersion?: unknown; limit?: unknown }
  const suiteVersion = String(body.suiteVersion || DEFAULT_SUITE).trim() || DEFAULT_SUITE
  const requested = Number.isFinite(Number(body.limit)) ? Math.floor(Number(body.limit)) : DEFAULT_LIMIT
  const limit = Math.max(1, Math.min(MAX_LIMIT, requested))

  const casesResult = await db.from('cos_credibility_cases')
    .select('id,case_key,domain,task_kind,prompt,gold_spec,expected_abstain,robustness_group')
    .eq('suite_version', suiteVersion)
    .eq('active', true)
    .order('case_key', { ascending: true })
    .limit(limit)
  if (casesResult.error) return NextResponse.json({ ok: false, error: casesResult.error.message }, { status: 500 })
  const cases = casesResult.data ?? []
  if (!cases.length) return NextResponse.json({ ok: false, error: `No active credibility cases exist for ${suiteVersion}.` }, { status: 404 })

  const runResult = await db.from('cos_credibility_runs').insert({
    suite_version: suiteVersion,
    status: 'running',
    case_count: cases.length,
  }).select('id').single()
  if (runResult.error || !runResult.data?.id) {
    return NextResponse.json({ ok: false, error: runResult.error?.message || 'Could not create credibility run.' }, { status: 500 })
  }
  const runId = String(runResult.data.id)
  const observations: CredibilityObservation[] = []
  let failures = 0

  for (const benchmarkCase of cases) {
    const started = Date.now()
    try {
      const result = await tryCOSFirstAnswer({ prompt: String(benchmarkCase.prompt), language: 'English' })
      const answer = result.handled ? result.reply : result.bestEffortReply || result.reason
      const gold = { ...((benchmarkCase.gold_spec || {}) as CredibilityGoldSpec), expectedAbstain: Boolean(benchmarkCase.expected_abstain) }
      const evaluated = evaluateCredibilityAnswer(answer, gold, !result.handled)
      const provenanceTruthful = provenanceMatchesAnswer(answer, result.provenance)
      const conclusionKey = evaluated.correct
        ? String(gold.conclusionKey || benchmarkCase.case_key)
        : `incorrect:${String(benchmarkCase.case_key)}`
      const observation: CredibilityObservation = {
        predictedConfidence: result.confidence,
        correctness: evaluated.correctness,
        abstained: evaluated.abstained,
        shouldAbstain: evaluated.shouldAbstain,
        provenanceTruthful,
        actionCorrect: null,
        robustnessGroup: benchmarkCase.robustness_group ? String(benchmarkCase.robustness_group) : null,
        conclusionKey,
      }
      observations.push(observation)
      const insert = await db.from('cos_credibility_observations').insert({
        run_id: runId,
        case_id: benchmarkCase.id,
        suite_version: suiteVersion,
        case_key: benchmarkCase.case_key,
        domain: benchmarkCase.domain,
        task_kind: benchmarkCase.task_kind,
        predicted_confidence: result.confidence,
        correctness: evaluated.correctness,
        abstained: evaluated.abstained,
        should_abstain: evaluated.shouldAbstain,
        provenance_truthful: provenanceTruthful,
        action_correct: null,
        robustness_group: benchmarkCase.robustness_group,
        conclusion_key: conclusionKey,
        answer,
        evaluator: evaluated,
        response_source: result.provenance.responseSource,
        reasoner_label: result.provenance.reasonerLabel,
        latency_ms: Date.now() - started,
      })
      if (insert.error) throw insert.error
    } catch (error) {
      failures += 1
      console.error('cosCredibility: benchmark case failed', { caseKey: benchmarkCase.case_key, error })
    }
  }

  const report = credibilityReport(observations)
  const calibration = fitIsotonicCalibration(observations)
  await db.from('cos_credibility_runs').update({
    status: failures ? 'completed_with_errors' : 'completed',
    completed_at: new Date().toISOString(),
    observation_count: observations.length,
    failure_count: failures,
    report,
    calibration,
  }).eq('id', runId)

  return NextResponse.json({
    ok: failures === 0,
    runId,
    suiteVersion,
    casesRequested: cases.length,
    observations: observations.length,
    failures,
    report,
    calibration,
    calibrationReady: false,
    note: 'This bounded smoke run measures the pipeline only. Never promote its fitted calibration into live confidence; certification requires a large disjoint holdout set.',
  }, { status: failures ? 207 : 200 })
}
