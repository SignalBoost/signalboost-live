import { cosServiceDb, createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { persistKnowledgeFactWithEmbedding } from '@/lib/ai/cos/knowledgeFactSemantic'
import {
  extractFactsFromDocument,
  toKnowledgeFact,
  type ExtractionSourceDocument,
} from '@/lib/ai/cos/knowledgeFactExtraction'

export type AutoPromotionResult = {
  status: 'promoted' | 'skipped' | 'error'
  documentsProcessed: number
  documentsCompleted: number
  documentsFailed: number
  factsWritten: number
  proposed: number
  rejectedUngrounded: number
  rejectedMalformed: number
  stoppedForBudget: boolean
  error?: string
}

const EMPTY: Omit<AutoPromotionResult, 'status'> = {
  documentsProcessed: 0,
  documentsCompleted: 0,
  documentsFailed: 0,
  factsWritten: 0,
  proposed: 0,
  rejectedUngrounded: 0,
  rejectedMalformed: 0,
  stoppedForBudget: false,
}

const MIN_DOCUMENT_START_BUDGET_MS = 225_000
const MAX_AUTO_RETRIES = 3

function asDocument(row: any): ExtractionSourceDocument {
  return {
    contentHash: String(row.content_hash ?? ''),
    subject: String(row.subject ?? ''),
    summary: String(row.summary ?? ''),
    sourceUri: String(row.source_uri ?? ''),
    sourceTitle: row.source_title ? String(row.source_title) : null,
    confidence: Number(row.confidence ?? 0),
  }
}

async function selectPromotionCandidates(limit: number) {
  const db = cosServiceDb()
  if (!db) return { data: [], error: null }

  const pending = await db.from('cos_continuous_learning')
    .select('content_hash,subject,summary,source_uri,source_title,confidence,fact_extraction_attempts')
    .is('fact_extraction_status', null)
    .not('summary', 'eq', '')
    .order('observed_at', { ascending: true })
    .order('confidence', { ascending: false })
    .limit(limit)
  if (pending.error || (pending.data?.length ?? 0) >= limit) return pending

  const remaining = limit - (pending.data?.length ?? 0)
  const failed = await db.from('cos_continuous_learning')
    .select('content_hash,subject,summary,source_uri,source_title,confidence,fact_extraction_attempts')
    .eq('fact_extraction_status', 'failed')
    .lt('fact_extraction_attempts', MAX_AUTO_RETRIES)
    .not('summary', 'eq', '')
    .order('fact_extraction_attempted_at', { ascending: true })
    .limit(remaining)
  if (failed.error) return failed
  return { data: [...(pending.data ?? []), ...(failed.data ?? [])], error: null }
}

/**
 * Promote learned corpus documents into structured knowledge facts.
 * Extraction uses COS's local reasoner and source-grounding checks. Completion is persisted on
 * the corpus row independently of fact count, so a valid zero-fact extraction is still complete.
 * The optional deadline prevents this background task from starting model work it cannot finish.
 */
export async function autoPromoteLearnedKnowledge(limit = 5, deadlineMs?: number): Promise<AutoPromotionResult> {
  const db = cosServiceDb()
  const stores = createSupabaseCOSStores()
  if (!db || !stores) {
    return { status: 'skipped', ...EMPTY, error: 'COS Supabase service store is not configured' }
  }

  const reasoner = resolveCosReasoner()
  if (!reasoner.config) {
    return { status: 'error', ...EMPTY, error: 'reason' in reasoner ? reasoner.reason : 'COS local reasoner is not configured' }
  }

  try {
    const requested = Math.max(1, Math.min(10, Math.floor(limit)))
    const candidates = await selectPromotionCandidates(requested)
    if (candidates.error) throw candidates.error

    let documentsProcessed = 0
    let documentsCompleted = 0
    let documentsFailed = 0
    let factsWritten = 0
    let proposed = 0
    let rejectedUngrounded = 0
    let rejectedMalformed = 0
    let stoppedForBudget = false
    const errors: string[] = []

    for (const row of candidates.data ?? []) {
      if (deadlineMs != null && deadlineMs - Date.now() < MIN_DOCUMENT_START_BUDGET_MS) {
        stoppedForBudget = true
        break
      }

      const document = asDocument(row)
      const attemptedAt = new Date().toISOString()
      const attempts = Number(row.fact_extraction_attempts ?? 0) + 1
      documentsProcessed += 1

      const result = await extractFactsFromDocument(document)
      proposed += result.proposed
      rejectedUngrounded += result.rejectedUngrounded
      rejectedMalformed += result.rejectedMalformed

      if (result.error) {
        documentsFailed += 1
        errors.push(`${document.sourceUri}: ${result.error}`)
        const { error: markError } = await db.from('cos_continuous_learning').update({
          fact_extraction_status: 'failed',
          fact_extraction_attempts: attempts,
          fact_extraction_attempted_at: attemptedAt,
          fact_extraction_error: result.error.slice(0, 1000),
        }).eq('content_hash', document.contentHash)
        if (markError) throw markError
        continue
      }

      for (const triple of result.grounded) {
        const fact = toKnowledgeFact(triple, document.sourceUri)
        await persistKnowledgeFactWithEmbedding(stores.knowledge, fact)
        factsWritten += 1
      }

      const completedAt = new Date().toISOString()
      const { error: markError } = await db.from('cos_continuous_learning').update({
        fact_extraction_status: 'completed',
        fact_extraction_attempts: attempts,
        fact_extraction_attempted_at: attemptedAt,
        fact_extracted_at: completedAt,
        fact_extraction_error: null,
      }).eq('content_hash', document.contentHash)
      if (markError) throw markError
      documentsCompleted += 1
    }

    const status: AutoPromotionResult['status'] =
      documentsProcessed === 0 ? 'skipped' :
      documentsCompleted === 0 && documentsFailed > 0 ? 'error' :
      'promoted'
    const result: AutoPromotionResult = {
      status,
      documentsProcessed,
      documentsCompleted,
      documentsFailed,
      factsWritten,
      proposed,
      rejectedUngrounded,
      rejectedMalformed,
      stoppedForBudget,
      ...(errors.length ? { error: errors.join(' | ').slice(0, 2000) } : {}),
    }
    console.info('[cos-learning-auto-promotion]', JSON.stringify(result))
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cos-learning-auto-promotion-failed]', message)
    return { status: 'error', ...EMPTY, error: message }
  }
}
