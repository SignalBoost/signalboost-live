import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BENCHMARK_PROMPT = [
  'Using COS internal learned knowledge where available, explain how robotic manipulation should combine tactile feedback,',
  'inverse kinematics or spatial geometry, probabilistic state estimation, and thermal constraints when handling an',
  'unpredictable deformable object. Give concrete mechanisms and observables; distinguish internal evidence from inference.',
].join(' ')

export async function GET() {
  const access = await getAccess()
  if (!access.userId) return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  if (!access.isOwner && !access.isAdmin) return NextResponse.json({ ok: false, error: 'Owner or admin access required.' }, { status: 403 })

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS persistent store unavailable.' }, { status: 503 })

  const terms = ['robot', 'tactile', 'kinematic', 'spatial', 'thermal', 'probabil', 'manipulation']
  const filters = terms.flatMap(term => [`subject.ilike.%${term}%`, `summary.ilike.%${term}%`]).join(',')
  const retained = await db
    .from('cos_continuous_learning')
    .select('subject,summary,confidence,source_kind,source_uri,observed_at')
    .or(filters)
    .order('confidence', { ascending: false })
    .limit(12)

  if (retained.error) return NextResponse.json({ ok: false, error: retained.error.message }, { status: 500 })

  const result = await tryCOSFirstAnswer({ prompt: BENCHMARK_PROMPT, userId: access.userId, language: 'en', privileged: true })
  const provenance = result.provenance
  const assertions = {
    retainedRoboticsEvidencePresent: (retained.data ?? []).length > 0,
    cosHandledIndependently: result.handled,
    learnedCorpusConsulted: provenance.internalSystemsConsulted.includes('Continuous Learning Corpus'),
    learnedItemsSuppliedToAnswer: provenance.learnedItemsUsed > 0,
    localReasonerPrimary: provenance.localModelInvoked && provenance.reasonerLabel?.startsWith('independent-local:') === true,
    externalAiNotInvoked: provenance.externalAiInvoked === false,
  }

  return NextResponse.json({
    ok: Object.values(assertions).every(Boolean),
    prompt: BENCHMARK_PROMPT,
    retainedEvidenceCount: (retained.data ?? []).length,
    retainedEvidence: (retained.data ?? []).map(row => ({ subject: row.subject, summary: row.summary, confidence: row.confidence, sourceKind: row.source_kind, sourceUri: row.source_uri, observedAt: row.observed_at })),
    answer: result.handled ? result.reply : null,
    confidence: result.confidence,
    reason: result.handled ? null : result.reason,
    provenance,
    assertions,
  })
}
