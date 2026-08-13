import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { tryCOSFirstAnswer, type COSFirstAnswerResult } from '@/lib/ai/cos/cosFirstAnswer'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  answerContainsRetentionFixture,
  parseRetentionBenchmarkFixture,
  retentionBenchmarkParaphrase,
  retentionBenchmarkPersistenceQuestion,
  retentionBenchmarkQuestion,
  retentionBenchmarkSourceUri,
} from '@/lib/ai/cos/retentionBenchmark'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BENCHMARK_PROMPT = [
  'Robotic manipulation tactile kinematics spatial thermal probability:',
  'using COS internal learned knowledge where available, explain how a robot should combine tactile feedback,',
  'inverse kinematics or spatial geometry, probabilistic state estimation, and thermal constraints while handling an',
  'unpredictable deformable object. Give concrete mechanisms and observables, and distinguish retained evidence from inference.',
].join(' ')

function answerText(result: COSFirstAnswerResult): string {
  return result.handled ? result.reply : result.bestEffortReply ?? ''
}

function cacheHit(result: COSFirstAnswerResult): boolean {
  return result.handled && !result.provenance.localModelInvoked &&
    (result.provenance.responseSource === 'semantic_cache' || result.provenance.responseSource === 'semantic_similarity')
}

function provenanceView(result: COSFirstAnswerResult) {
  const p = result.provenance
  return {
    handled: result.handled,
    confidence: result.confidence,
    responseSource: p.responseSource,
    similarityScore: p.similarityScore ?? null,
    localModelInvoked: p.localModelInvoked,
    reasonerLabel: p.reasonerLabel,
    externalAiInvoked: p.externalAiInvoked,
    knowledgeGraph: p.evidenceFunnel.knowledgeGraph,
    learnedCorpus: p.evidenceFunnel.learnedCorpus,
    cognitiveSkills: p.cognitiveSkillFunnel,
    knowledgeFactsCited: p.knowledgeFactsCited ?? 0,
    learnedItemsCited: p.learnedItemsCited ?? 0,
    cognitiveSkillsCited: p.cognitiveSkillsCited ?? 0,
    cacheOrigin: p.cacheOrigin ?? null,
  }
}

async function runCanaryBenchmark(req: NextRequest, userId: string) {
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS persistent store unavailable.' }, { status: 503 })

  const requestedRunId = req.nextUrl.searchParams.get('runId')?.trim().toLowerCase() || ''
  let query = db.from('cos_continuous_learning')
    .select('content_hash,source_kind,source_uri,source_title,observed_at,subject,summary,facts,confidence,created_at,fact_extraction_status')
    .eq('source_kind', 'benchmark_fixture')
  if (requestedRunId) query = query.eq('source_uri', retentionBenchmarkSourceUri(requestedRunId))
  else query = query.order('created_at', { ascending: false }).limit(1)

  const stored = await query.maybeSingle()
  if (stored.error) return NextResponse.json({ ok: false, error: stored.error.message }, { status: 500 })
  if (!stored.data) return NextResponse.json({ ok: false, error: 'No COS retention benchmark fixture exists.' }, { status: 404 })
  const fixture = parseRetentionBenchmarkFixture(stored.data)
  if (!fixture) return NextResponse.json({ ok: false, error: 'Stored benchmark fixture is malformed.' }, { status: 500 })

  const kgQuery = await db.from('cos_knowledge_facts').select('id', { count: 'exact', head: true }).eq('source', fixture.sourceUri)
  const kgFactCount = kgQuery.error ? null : kgQuery.count ?? 0
  const persistenceMode = req.nextUrl.searchParams.get('proof') === 'persistence'

  if (persistenceMode) {
    const prompt = retentionBenchmarkPersistenceQuestion(fixture.protocol)
    const result = await tryCOSFirstAnswer({ prompt, userId, language: 'en', privileged: true })
    const answer = answerText(result)
    const assertions = {
      durableCorpusRowPresent: true,
      answerCorrectFromRetainedCanary: answerContainsRetentionFixture(answer, fixture),
      durableEvidenceRetrieved: result.provenance.evidenceFunnel.learnedCorpus.retrieved > 0 || result.provenance.evidenceFunnel.knowledgeGraph.retrieved > 0,
      durableEvidenceSelected: result.provenance.evidenceFunnel.learnedCorpus.selected > 0 || result.provenance.evidenceFunnel.knowledgeGraph.selected > 0,
      durableEvidenceCited: (result.provenance.learnedItemsCited ?? 0) + (result.provenance.knowledgeFactsCited ?? 0) > 0,
      externalAiNotInvoked: result.provenance.externalAiInvoked === false,
    }
    return NextResponse.json({
      ok: Object.values(assertions).every(Boolean),
      benchmark: 'COS Learning & Retention Benchmark',
      proof: 'persistence',
      runId: fixture.runId,
      canary: { protocol: fixture.protocol, quorum: `${fixture.quorumRequired} of ${fixture.quorumTotal}`, marker: fixture.marker },
      kgFactCount,
      freshLocalRetrieval: result.provenance.localModelInvoked,
      answer,
      provenance: provenanceView(result),
      assertions,
      interpretation: result.provenance.localModelInvoked
        ? 'Fresh local reasoning retrieved durable retained evidence. Run this after a RunPod restart to prove retention outside process memory.'
        : 'A cached answer was reused. The durable corpus row is still present, but this call did not exercise fresh local reasoning.',
    })
  }

  const question = retentionBenchmarkQuestion(fixture.protocol)
  const fresh = await tryCOSFirstAnswer({ prompt: question, userId, language: 'en', privileged: true })
  const exact = await tryCOSFirstAnswer({ prompt: question, userId, language: 'en', privileged: true })
  const semantic = await tryCOSFirstAnswer({ prompt: retentionBenchmarkParaphrase(fixture.protocol), userId, language: 'en', privileged: true })
  const freshAnswer = answerText(fresh), exactAnswer = answerText(exact), semanticAnswer = answerText(semantic)
  const assertions = {
    durableCorpusRowPresent: true,
    learnedCorpusRetrieved: fresh.provenance.evidenceFunnel.learnedCorpus.retrieved > 0,
    learnedCorpusSelected: fresh.provenance.evidenceFunnel.learnedCorpus.selected > 0,
    learnedCorpusCited: (fresh.provenance.learnedItemsCited ?? 0) > 0,
    firstAnswerCorrect: answerContainsRetentionFixture(freshAnswer, fixture),
    firstAnswerLocalReasoning: fresh.provenance.localModelInvoked && fresh.provenance.responseSource === 'local_cos_reasoning',
    exactRepeatCorrect: answerContainsRetentionFixture(exactAnswer, fixture),
    exactRepeatCacheHit: cacheHit(exact),
    semanticParaphraseCorrect: answerContainsRetentionFixture(semanticAnswer, fixture),
    semanticParaphraseCacheHit: cacheHit(semantic),
    externalAiNeverInvoked: !fresh.provenance.externalAiInvoked && !exact.provenance.externalAiInvoked && !semantic.provenance.externalAiInvoked,
  }

  return NextResponse.json({
    ok: Object.values(assertions).every(Boolean),
    benchmark: 'COS Learning & Retention Benchmark',
    proof: 'cache-and-retention',
    runId: fixture.runId,
    canary: { protocol: fixture.protocol, quorum: `${fixture.quorumRequired} of ${fixture.quorumTotal}`, marker: fixture.marker },
    retainedAt: stored.data.created_at ?? null,
    observedAt: stored.data.observed_at ?? null,
    kgFactCount,
    fresh: { answer: freshAnswer, provenance: provenanceView(fresh) },
    exactRepeat: { answer: exactAnswer, provenance: provenanceView(exact) },
    semanticParaphrase: { answer: semanticAnswer, provenance: provenanceView(semantic) },
    assertions,
  })
}

export async function GET(req: NextRequest) {
  const access = await getAccess()
  if (!access.userId) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  if (!access.isOwner && !access.isAdmin) return NextResponse.json({ ok: false, error: 'Owner or admin access required.' }, { status: 403 })

  if (req.nextUrl.searchParams.get('mode') === 'canary') return runCanaryBenchmark(req, access.userId)

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS persistent store unavailable.' }, { status: 503 })
  const terms = ['robot', 'tactile', 'kinematic', 'spatial', 'thermal', 'probabil']
  const filters = terms.flatMap(term => [`subject.ilike.%${term}%`, `summary.ilike.%${term}%`]).join(',')
  const retained = await db.from('cos_continuous_learning')
    .select('subject,summary,confidence,source_kind,source_uri,observed_at')
    .or(filters).order('confidence', { ascending: false }).limit(12)
  if (retained.error) return NextResponse.json({ ok: false, error: retained.error.message }, { status: 500 })

  const prompt = `${BENCHMARK_PROMPT} Benchmark run ${Date.now()}.`
  const result = await tryCOSFirstAnswer({ prompt, userId: access.userId, language: 'en', privileged: true })
  const p = result.provenance
  const assertions = {
    retainedRoboticsEvidencePresent: (retained.data ?? []).length > 0,
    cosHandledIndependently: result.handled,
    learnedCorpusConsulted: p.internalSystemsConsulted.includes('Continuous Learning Corpus'),
    learnedItemsSuppliedToAnswer: p.learnedItemsUsed > 0,
    localReasonerPrimary: p.localModelInvoked && p.reasonerLabel?.startsWith('independent-local:') === true,
    externalAiNotInvoked: p.externalAiInvoked === false,
  }
  return NextResponse.json({
    ok: Object.values(assertions).every(Boolean), prompt,
    retainedEvidenceCount: (retained.data ?? []).length,
    retainedEvidence: (retained.data ?? []).map(row => ({ subject: row.subject, summary: row.summary, confidence: row.confidence, sourceKind: row.source_kind, sourceUri: row.source_uri, observedAt: row.observed_at })),
    answer: result.handled ? result.reply : null,
    confidence: result.confidence,
    reason: result.handled === false ? result.reason : null,
    provenance: p,
    assertions,
  })
}
