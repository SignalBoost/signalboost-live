import { cosServiceDb, createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import {
  extractFactsFromDocument,
  resolveExtractionBatch,
  toKnowledgeFact,
  type ExtractionSourceDocument,
} from '@/lib/ai/cos/knowledgeFactExtraction'

export type AutoPromotionResult = {
  status: 'promoted' | 'skipped' | 'error'
  documentsProcessed: number
  factsWritten: number
  proposed: number
  rejectedUngrounded: number
  rejectedMalformed: number
  error?: string
}

/**
 * Promote a small bounded batch of newly learned corpus documents into the structured
 * knowledge-fact store immediately after autonomous learning. This closes the gap where
 * COS could keep accumulating cos_continuous_learning rows indefinitely while
 * cos_knowledge_facts remained empty unless an owner manually called the extraction route.
 *
 * Safety stays identical to the manual extractor: extraction uses COS's local reasoner and
 * every candidate triple must pass source-grounding validation before it is stored.
 */
export async function autoPromoteLearnedKnowledge(limit = 5): Promise<AutoPromotionResult> {
  const db = cosServiceDb()
  const stores = createSupabaseCOSStores()
  if (!db || !stores) {
    return { status: 'skipped', documentsProcessed: 0, factsWritten: 0, proposed: 0, rejectedUngrounded: 0, rejectedMalformed: 0, error: 'COS Supabase service store is not configured' }
  }

  try {
    const [corpus, extracted] = await Promise.all([
      db.from('cos_continuous_learning')
        .select('content_hash,subject,summary,source_uri,source_title,confidence')
        .order('observed_at', { ascending: false })
        .order('confidence', { ascending: false })
        .limit(200),
      db.from('cos_knowledge_facts').select('source'),
    ])

    if (corpus.error) throw corpus.error
    if (extracted.error) throw extracted.error

    const documents: ExtractionSourceDocument[] = (corpus.data ?? []).map(row => ({
      contentHash: String(row.content_hash ?? ''),
      subject: String(row.subject ?? ''),
      summary: String(row.summary ?? ''),
      sourceUri: String(row.source_uri ?? ''),
      sourceTitle: row.source_title ? String(row.source_title) : null,
      confidence: Number(row.confidence ?? 0),
    }))
    const alreadyExtracted = new Set((extracted.data ?? []).map(row => String(row.source)))
    const batch = resolveExtractionBatch(documents, alreadyExtracted, Math.max(1, Math.min(10, limit)), false)

    let factsWritten = 0
    let proposed = 0
    let rejectedUngrounded = 0
    let rejectedMalformed = 0

    for (const document of batch) {
      const result = await extractFactsFromDocument(document)
      proposed += result.proposed
      rejectedUngrounded += result.rejectedUngrounded
      rejectedMalformed += result.rejectedMalformed
      for (const triple of result.grounded) {
        await stores.knowledge.upsertFact(toKnowledgeFact(triple, document.sourceUri))
        factsWritten += 1
      }
    }

    console.info('[cos-learning-auto-promotion]', JSON.stringify({
      documentsProcessed: batch.length,
      factsWritten,
      proposed,
      rejectedUngrounded,
      rejectedMalformed,
    }))

    return {
      status: 'promoted',
      documentsProcessed: batch.length,
      factsWritten,
      proposed,
      rejectedUngrounded,
      rejectedMalformed,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cos-learning-auto-promotion-failed]', message)
    return { status: 'error', documentsProcessed: 0, factsWritten: 0, proposed: 0, rejectedUngrounded: 0, rejectedMalformed: 0, error: message }
  }
}
