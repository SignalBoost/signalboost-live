//
// Turns studied documents into retrievable facts. GET reports how much of the corpus has been
// extracted; POST runs a bounded batch. Owner-only, and a no-op unless COS's own reasoner is
// configured and reachable — the pod must be running, same as a study run.
//
// Progress is tracked by comparing source URIs already present in cos_knowledge_facts against the
// corpus, so no schema change and no bookkeeping column: re-running is safe and idempotent, and a
// document whose extraction produced nothing is simply retried next time.

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb, createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { extractFactsFromDocument, resolveExtractionBatch, toKnowledgeFact, type ExtractionSourceDocument } from '@/lib/ai/cos/knowledgeFactExtraction'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_BATCH_SIZE = 5
const MAX_BATCH_SIZE = 15

async function corpusState() {
  const db = cosServiceDb()
  if (!db) return null
  const [corpus, facts] = await Promise.all([
    db.from('cos_continuous_learning').select('source_uri', { count: 'exact', head: true }),
    db.from('cos_knowledge_facts').select('id', { count: 'exact', head: true }),
  ])
  return {
    studiedDocuments: corpus.error ? null : corpus.count ?? 0,
    knownFacts: facts.error ? null : facts.count ?? 0,
  }
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const reasoner = resolveCosReasoner()
  return NextResponse.json({
    ok: true,
    reasoner: reasoner.config ? { configured: true, label: reasoner.config.label } : { configured: false, reason: (reasoner as { reason: string }).reason },
    corpus: await corpusState(),
    recommendedBatchSize: DEFAULT_BATCH_SIZE,
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const reasoner = resolveCosReasoner()
  if (!reasoner.config) {
    return NextResponse.json({ ok: false, error: (reasoner as { reason: string }).reason }, { status: 409 })
  }

  const db = cosServiceDb()
  const stores = createSupabaseCOSStores()
  if (!db || !stores) return NextResponse.json({ ok: false, error: 'COS Supabase service store is not configured.' }, { status: 503 })

  try {
    const body = await req.json().catch(() => ({})) as { limit?: unknown; reextract?: unknown }
    const requested = Number.isFinite(Number(body.limit)) ? Math.floor(Number(body.limit)) : DEFAULT_BATCH_SIZE
    const limit = Math.max(1, Math.min(MAX_BATCH_SIZE, requested))
    const reextract = body.reextract === true

    const corpus = await db.from('cos_continuous_learning')
      .select('content_hash,subject,summary,source_uri,source_title,confidence')
      .order('confidence', { ascending: false })
      .limit(200)
    if (corpus.error) throw corpus.error

    const extracted = await db.from('cos_knowledge_facts').select('source')
    if (extracted.error) throw extracted.error

    const documents: ExtractionSourceDocument[] = (corpus.data ?? []).map(row => ({
      contentHash: String(row.content_hash),
      subject: String(row.subject ?? ''),
      summary: String(row.summary ?? ''),
      sourceUri: String(row.source_uri ?? ''),
      sourceTitle: row.source_title ? String(row.source_title) : null,
      confidence: Number(row.confidence ?? 0),
    }))
    const alreadyExtracted = new Set((extracted.data ?? []).map(row => String(row.source)))
    const batch = resolveExtractionBatch(documents, alreadyExtracted, limit, reextract)

    let factsWritten = 0, ungrounded = 0, malformed = 0, proposed = 0
    const perDocument = []
    for (const document of batch) {
      const result = await extractFactsFromDocument(document)
      proposed += result.proposed
      ungrounded += result.rejectedUngrounded
      malformed += result.rejectedMalformed
      for (const triple of result.grounded) {
        await stores.knowledge.upsertFact(toKnowledgeFact(triple, document.sourceUri))
        factsWritten += 1
      }
      perDocument.push({
        sourceUri: document.sourceUri,
        sourceTitle: document.sourceTitle,
        proposed: result.proposed,
        stored: result.grounded.length,
        rejectedUngrounded: result.rejectedUngrounded,
        rejectedMalformed: result.rejectedMalformed,
        error: result.error ?? null,
      })
    }

    return NextResponse.json({
      ok: true,
      reasoner: reasoner.config.label,
      documentsProcessed: batch.length,
      documentsRemaining: Math.max(0, documents.filter(d => reextract || !alreadyExtracted.has(d.sourceUri)).length - batch.length),
      proposed,
      factsWritten,
      rejectedUngrounded: ungrounded,
      rejectedMalformed: malformed,
      corpus: await corpusState(),
      perDocument,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('cosFactExtraction: run failed', error)
    return NextResponse.json({ ok: false, error: message || 'Fact extraction run failed.' }, { status: 500 })
  }
}
