import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import {
  ContinuousLearningDirector,
  DEFAULT_CONTINUOUS_LEARNING_POLICY,
  type ContinuousLearningSourceKind,
  type LearningCandidate,
} from '@/lib/cos-core/layers/learning'
import { createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOURCE_TYPES = new Set<ContinuousLearningSourceKind>([
  'work_experience',
  'engineering_history',
  'official_documentation',
  'research_paper',
  'scientific_journal',
  'library_material',
  'news_article',
  'public_dataset',
  'video_transcript',
  'approved_public_web',
])

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function sourceKind(value: unknown): ContinuousLearningSourceKind | null {
  const normalized = clean(value, 80) as ContinuousLearningSourceKind
  return SOURCE_TYPES.has(normalized) ? normalized : null
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const body = await req.json().catch(() => null)
  const text = clean(body?.text, 20_000)
  const uri = clean(body?.source_url || body?.sourceUri, 2000)
  const kind = sourceKind(body?.source_type || body?.sourceKind)
  const topics = Array.isArray(body?.topics) ? body.topics.map((item: unknown) => clean(item, 120)).filter(Boolean).slice(0, 20) : []
  const subject = clean(body?.subject || topics.join(' ') || 'manual COS knowledge', 300)
  const confidenceInput = Number(body?.confidence ?? 0.85)
  const confidence = Number.isFinite(confidenceInput) ? Math.max(0, Math.min(1, confidenceInput)) : 0.85

  if (!text) return NextResponse.json({ ok: false, error: 'TEXT_REQUIRED' }, { status: 400 })
  if (!uri) return NextResponse.json({ ok: false, error: 'SOURCE_URL_REQUIRED' }, { status: 400 })
  if (!kind) return NextResponse.json({ ok: false, error: 'INVALID_SOURCE_TYPE' }, { status: 400 })

  const stores = createSupabaseCOSStores()
  if (!stores?.continuousLearning) return NextResponse.json({ ok: false, error: 'COS_STORE_UNAVAILABLE' }, { status: 503 })

  const summary = text.slice(0, 1200)
  const observedAt = new Date().toISOString()
  const candidate: LearningCandidate = {
    contentHash: createHash('sha256').update(`${uri}\n${text}`).digest('hex'),
    sourceKind: kind,
    sourceUri: uri,
    sourceTitle: clean(body?.source_title || body?.sourceTitle, 300) || undefined,
    observedAt,
    subject,
    summary,
    facts: [{ predicate: 'source_summary', object: summary, confidence }],
    confidence,
    license: clean(body?.license, 200) || null,
    evidence: [clean(body?.evidence || `Owner-approved knowledge seed: ${uri}`, 1000)],
  }

  try {
    const director = new ContinuousLearningDirector(stores.continuousLearning, DEFAULT_CONTINUOUS_LEARNING_POLICY)
    const decision = await director.admit(candidate, 0)
    return NextResponse.json({
      ok: decision.accepted || decision.reason === 'duplicate',
      accepted: decision.accepted,
      reason: decision.reason,
      contentHash: candidate.contentHash,
      subject,
      sourceKind: kind,
      retainedTo: decision.accepted ? ['continuous_learning_corpus', 'knowledge_graph_enterprise_facts'] : [],
      providerCalls: 0,
      externalAiCalls: 0,
    }, { status: decision.accepted || decision.reason === 'duplicate' ? 200 : 422 })
  } catch (error) {
    console.error('COS knowledge seed failed:', error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'COS_KNOWLEDGE_SEED_FAILED' }, { status: 500 })
  }
}