import { NextResponse } from 'next/server'
import { probeReasoner } from '@/lib/ai/cos/reasonerProbe'
import { generateLocalEmbeddings, LOCAL_EMBEDDING_DIMENSIONS } from '@/lib/ai/cos/localEmbeddings'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runPrivateCapabilityCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'
import { readLearningContinuity } from '@/lib/ai/cos/learningContinuityReport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const EXPECTED_BRANCH = 'test/deepinfra-preview-20260820'
const MAX_CASES = 2

const terms = (value: unknown) => Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : []
const errorText = (value: unknown): string => value instanceof Error ? value.message : typeof value === 'string' ? value : JSON.stringify(value) || String(value ?? 'Unknown validation error')

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const reasoner = await probeReasoner()
  if (reasoner.verdict !== 'ok') {
    return NextResponse.json({
      ok: false,
      previewOnly: true,
      stage: 'reasoner',
      reasoner: {
        verdict: reasoner.verdict,
        summary: reasoner.summary,
        config: reasoner.config,
        modelList: reasoner.modelList,
        completion: reasoner.completion,
      },
    }, { status: 503 })
  }

  let embeddingDimensions: number | null = null
  try {
    const vectors = await generateLocalEmbeddings(['COS Preview migration validation'])
    embeddingDimensions = vectors[0]?.length ?? null
  } catch (error) {
    return NextResponse.json({
      ok: false,
      previewOnly: true,
      stage: 'embeddings',
      reasoner: { verdict: reasoner.verdict, summary: reasoner.summary, config: reasoner.config },
      embeddings: { ok: false, dimensions: embeddingDimensions, requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS, error: errorText(error) },
    }, { status: 503 })
  }

  if (embeddingDimensions !== LOCAL_EMBEDDING_DIMENSIONS) {
    return NextResponse.json({
      ok: false,
      previewOnly: true,
      stage: 'embeddings',
      embeddings: { ok: false, dimensions: embeddingDimensions, requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS },
    }, { status: 503 })
  }

  const db = cosServiceDb()
  if (!db) {
    return NextResponse.json({ ok: false, previewOnly: true, stage: 'database', error: 'COS service database is not configured.' }, { status: 503 })
  }

  const cases = await db
    .from('cos_capability_benchmark_cases')
    .select('id,track,prompt,required_terms,forbidden_terms,requires_local_reasoning')
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(MAX_CASES)

  if (cases.error) {
    return NextResponse.json({ ok: false, previewOnly: true, stage: 'benchmark_cases', error: cases.error.message }, { status: 500 })
  }

  let attempted = 0
  let passed = 0
  const benchmarkResults: Array<{
    track: string
    passed: boolean
    latencyMs: number
    responseSource: string
    localModelInvoked: boolean
    externalAiInvoked: boolean
  }> = []

  for (const row of cases.data ?? []) {
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
      })
      if (outcome.score.passed) passed += 1
      benchmarkResults.push({
        track: String(row.track),
        passed: outcome.score.passed,
        latencyMs: outcome.latencyMs,
        responseSource: outcome.provenance.responseSource,
        localModelInvoked: outcome.provenance.localModelInvoked,
        externalAiInvoked: outcome.provenance.externalAiInvoked,
      })
    } catch (error) {
      benchmarkResults.push({
        track: String(row.track),
        passed: false,
        latencyMs: 0,
        responseSource: `error:${errorText(error).slice(0, 160)}`,
        localModelInvoked: false,
        externalAiInvoked: false,
      })
    }
  }

  const continuity = await readLearningContinuity()
  const continuitySummary = 'error' in continuity
    ? { ok: false, error: continuity.error }
    : {
        ok: true,
        status: continuity.report.status,
        hoursSinceLastRetention: continuity.report.hoursSinceLastRetention,
        corpusDocuments: continuity.report.corpusDocuments,
        documentsLast7Days: continuity.report.documentsLast7Days,
        newSubjectsLast7Days: continuity.report.newSubjectsLast7Days,
        silentDaysLast7: continuity.report.silentDaysLast7,
        openGaps: continuity.report.openGaps,
        findings: continuity.report.findings.map(finding => finding.code),
      }

  const benchmarkOk = attempted > 0 && passed === attempted
  const ok = benchmarkOk && continuitySummary.ok === true

  const result = {
    ok,
    previewOnly: true,
    reasoner: {
      ok: true,
      verdict: reasoner.verdict,
      summary: reasoner.summary,
      model: reasoner.config.model,
      baseUrl: reasoner.config.baseUrl,
    },
    embeddings: {
      ok: true,
      dimensions: embeddingDimensions,
      requiredDimensions: LOCAL_EMBEDDING_DIMENSIONS,
    },
    benchmark: {
      ok: benchmarkOk,
      attempted,
      passed,
      passRate: attempted ? passed / attempted : 0,
      results: benchmarkResults,
      persisted: false,
    },
    learningContinuity: continuitySummary,
  }

  console.info('[cos-preview-migration-validation]', JSON.stringify({
    ok: result.ok,
    reasoner: result.reasoner,
    embeddings: result.embeddings,
    benchmark: result.benchmark,
    learningContinuity: result.learningContinuity,
  }))

  return NextResponse.json(result, { status: ok ? 200 : 503 })
}
