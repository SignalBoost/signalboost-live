import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  ACCEPTANCE_LANGUAGES,
  CONCIERGE_LANGUAGE_ACCEPTANCE_CASES,
  acceptanceCriticalTokens,
  executeConciergeLanguageAcceptanceCase,
  requiredNativeReviewTemplate,
  summarizeLanguageAcceptance,
  type ConciergeLanguageAcceptanceExecution,
} from '@/lib/ai/cos/conciergeLanguageAcceptance'
import type { ConciergeLanguage } from '@/lib/ai/cos/conciergeLanguageQuality'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REVIEWS = new Set(['pass', 'fail'])

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error ?? 'Unknown language acceptance error')).slice(0, 1600)
}

function validLanguage(value: unknown): value is ConciergeLanguage {
  return ACCEPTANCE_LANGUAGES.includes(String(value || '') as ConciergeLanguage)
}

function allNativeReviewsPass(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const reviews = value as Record<string, unknown>
  return ACCEPTANCE_LANGUAGES.every(language => reviews[language] === 'pass')
}

function failedVerdicts(execution: ConciergeLanguageAcceptanceExecution): string[] {
  return Object.entries(execution.verdicts)
    .filter(([, passed]) => !passed)
    .map(([name]) => `${execution.test.key}:${name}`)
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const runs = await db.from('concierge_language_acceptance_runs')
    .select('id,profile,status,started_at,completed_at,automated_gate_passed,full_gate_passed,observed_cases,language_summary,native_reviews,native_review_notes,failures,error')
    .order('started_at', { ascending: false })
    .limit(10)
  if (runs.error) return NextResponse.json({ ok: false, error: runs.error.message }, { status: 500 })

  const runIds = (runs.data ?? []).map(row => row.id)
  const results = runIds.length
    ? await db.from('concierge_language_acceptance_results')
      .select('id,run_id,case_key,title,language,category,passed,verdicts,response_excerpt,response_source,local_model_invoked,external_ai_invoked,native_reviewer_used,native_review_confidence,critical_tokens,latency_ms,created_at')
      .in('run_id', runIds)
      .order('created_at', { ascending: true })
    : { data: [], error: null }
  if (results.error) return NextResponse.json({ ok: false, error: results.error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    requiredCases: CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.length,
    requiredLanguages: ACCEPTANCE_LANGUAGES,
    runs: runs.data ?? [],
    results: results.data ?? [],
  })
}

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const created = await db.from('concierge_language_acceptance_runs')
    .insert({ native_reviews: requiredNativeReviewTemplate() })
    .select('id')
    .single()
  if (created.error || !created.data) {
    return NextResponse.json({ ok: false, error: created.error?.message ?? 'Could not create language acceptance run.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    runId: String(created.data.id),
    caseKeys: CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.map(test => test.key),
  })
}

export async function PUT(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { runId?: string; caseKey?: string }
  const runId = String(body.runId ?? '')
  const test = CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.find(candidate => candidate.key === body.caseKey)
  if (!UUID.test(runId) || !test) {
    return NextResponse.json({ ok: false, error: 'A valid run and language acceptance case are required.' }, { status: 400 })
  }

  const run = await db.from('concierge_language_acceptance_runs')
    .select('id,status,native_reviews')
    .eq('id', runId)
    .single()
  if (run.error || !run.data) return NextResponse.json({ ok: false, error: 'Language acceptance run was not found.' }, { status: 404 })
  if (run.data.status !== 'running') return NextResponse.json({ ok: false, error: 'Language acceptance run is already final.' }, { status: 409 })

  try {
    const execution = await executeConciergeLanguageAcceptanceCase(test)
    const row = {
      run_id: runId,
      case_key: test.key,
      title: test.title,
      language: test.language,
      category: test.category,
      passed: execution.passed,
      verdicts: execution.verdicts,
      response_excerpt: execution.reply.slice(0, 12_000),
      response_source: execution.responseSource || 'none',
      local_model_invoked: execution.localModelInvoked,
      external_ai_invoked: execution.externalAiInvoked,
      native_reviewer_used: execution.nativeReviewerUsed,
      native_review_confidence: execution.nativeReviewConfidence,
      critical_tokens: acceptanceCriticalTokens(test),
      latency_ms: execution.latencyMs,
    }
    const stored = await db.from('concierge_language_acceptance_results')
      .upsert(row, { onConflict: 'run_id,case_key' })
    if (stored.error) throw stored.error

    const collected = await db.from('concierge_language_acceptance_results')
      .select('case_key,language,passed,verdicts')
      .eq('run_id', runId)
    if (collected.error) throw collected.error
    const rows = collected.data ?? []
    const failures = rows.flatMap(item => Object.entries((item.verdicts ?? {}) as Record<string, boolean>)
      .filter(([, passed]) => !passed)
      .map(([name]) => `${item.case_key}:${name}`))
    if (!execution.passed) failures.push(...failedVerdicts(execution))
    const uniqueFailures = [...new Set(failures)]
    const languageSummary = summarizeLanguageAcceptance(rows.map(item => ({ language: item.language, passed: item.passed })))

    if (rows.length < CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.length) {
      const progress = await db.from('concierge_language_acceptance_runs').update({
        observed_cases: rows.length,
        language_summary: languageSummary,
        failures: uniqueFailures,
      }).eq('id', runId)
      if (progress.error) throw progress.error
      return NextResponse.json({ ok: true, runId, caseKey: test.key, completed: false, passed: execution.passed, verdicts: execution.verdicts })
    }

    const automatedGatePassed = rows.length === CONCIERGE_LANGUAGE_ACCEPTANCE_CASES.length && rows.every(item => item.passed === true)
    const fullGatePassed = automatedGatePassed && allNativeReviewsPass(run.data.native_reviews)
    const updated = await db.from('concierge_language_acceptance_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      automated_gate_passed: automatedGatePassed,
      full_gate_passed: fullGatePassed,
      observed_cases: rows.length,
      language_summary: languageSummary,
      failures: uniqueFailures,
    }).eq('id', runId)
    if (updated.error) throw updated.error

    return NextResponse.json({
      ok: true,
      runId,
      caseKey: test.key,
      completed: true,
      automatedGatePassed,
      fullGatePassed,
      languageSummary,
      failures: uniqueFailures,
    })
  } catch (error) {
    const message = errorText(error)
    await db.from('concierge_language_acceptance_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error: message }).eq('id', runId)
    return NextResponse.json({ ok: false, runId, error: message }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is not configured.' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { runId?: string; language?: string; verdict?: string; note?: string }
  const runId = String(body.runId ?? '')
  const verdict = String(body.verdict ?? '')
  if (!UUID.test(runId) || !validLanguage(body.language) || !REVIEWS.has(verdict)) {
    return NextResponse.json({ ok: false, error: 'A valid run, language, and native-review verdict are required.' }, { status: 400 })
  }
  const language = body.language

  const run = await db.from('concierge_language_acceptance_runs')
    .select('id,status,automated_gate_passed,native_reviews,native_review_notes')
    .eq('id', runId)
    .single()
  if (run.error || !run.data) return NextResponse.json({ ok: false, error: 'Language acceptance run was not found.' }, { status: 404 })
  if (run.data.status !== 'completed') return NextResponse.json({ ok: false, error: 'Finish the automated matrix before recording native review.' }, { status: 409 })

  const languageResults = await db.from('concierge_language_acceptance_results')
    .select('case_key')
    .eq('run_id', runId)
    .eq('language', language)
  if (languageResults.error) return NextResponse.json({ ok: false, error: languageResults.error.message }, { status: 500 })
  if ((languageResults.data ?? []).length !== 5) {
    return NextResponse.json({ ok: false, error: 'All five cases for this language must exist before native review.' }, { status: 409 })
  }

  const reviews = { ...((run.data.native_reviews || {}) as Record<string, string>), [language]: verdict }
  const notes = { ...((run.data.native_review_notes || {}) as Record<string, string>) }
  const note = String(body.note ?? '').trim().slice(0, 2000)
  if (note) notes[language] = note
  else delete notes[language]
  const fullGatePassed = run.data.automated_gate_passed === true && allNativeReviewsPass(reviews)

  const updated = await db.from('concierge_language_acceptance_runs').update({
    native_reviews: reviews,
    native_review_notes: notes,
    full_gate_passed: fullGatePassed,
  }).eq('id', runId)
  if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, runId, language, verdict, fullGatePassed, nativeReviews: reviews })
}
