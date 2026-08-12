import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BENCHMARK_PROMPT = [
  'Robotic manipulation tactile kinematics spatial thermal probability:',
  'using COS internal learned knowledge where available, explain how a robot should combine tactile feedback,',
  'inverse kinematics or spatial geometry, probabilistic state estimation, and thermal constraints while handling an',
  'unpredictable deformable object. Give concrete mechanisms and observables, and distinguish retained evidence from inference.',
].join(' ')

export async function GET() {
  const access = await getAccess()
  if (!access.userId) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  if (!access.isOwner && !access.isAdmin) return NextResponse.json({ ok: false, error: 'Owner or admin access required.' }, { status: 403 })

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS persistent store unavailable.' }, { status: 503 })

  const terms = ['robot', 'tactile', 'kinematic', 'spatial', 'thermal', 'probabil']
  const filters = terms.flatMap(term => [`subject.ilike.%${term}%`, `summary.ilike.%${term}%`]).join(',')
  const retained = await db
    .from('cos_continuous_learning')
    .select('subject,summary,confidence,source_kind,source_uri,observed_at')
    .or(filters)
    .order('confidence', { ascending: false })
    .limit(12)

  if (retained.error) return NextResponse.json({ ok: false, error: retained.error.message }, { status: 500 })

  // A harmless nonce prevents the benchmark itself from becoming an exact answer-cache hit.
  // It is appended after the retrieval-significant leading terms, so it cannot displace them
  // from COS's bounded query-term selection.
  const prompt = `${BENCHMARK_PROMPT} Benchmark run ${Date.now()}.`
  const result = await tryCOSFirstAnswer({ prompt, userId: access.userId, language: 'en', privileged: true })
  const provenance = result.provenance
  const assertions = {
    retainedRoboticsEvidencePresent: (retained.data ?? []).length > 0,
    cosHandledIndependently: result.handled,
    learnedCorpusConsulted: provenance.internalSystemsConsulted.includes('Continuous Learning Corpus'),
    learnedItemsSuppliedToAnswer: provenance.learnedItemsUsed > 0,
    localReasonerPrimary: provenance.localModelInvoked && provenance.reasonerLabel?.startsWith('independent-local:') === true,
    externalAiNotInvoked: provenance.externalAiInvoked === false,
  }

  const answer = result.handled ? result.reply : null
  const reason = result.handled ? null : result.reason

  return NextResponse.json({
    ok: Object.values(assertions).every(Boolean),
    prompt,
    retainedEvidenceCount: (retained.data ?? []).length,
    retainedEvidence: (retained.data ?? []).map(row => ({
      subject: row.subject,
      summary: row.summary,
      confidence: row.confidence,
      sourceKind: row.source_kind,
      sourceUri: row.source_uri,
      observedAt: row.observed_at,
    })),
    answer,
    confidence: result.confidence,
    reason,
    provenance,
    assertions,
  })
}
