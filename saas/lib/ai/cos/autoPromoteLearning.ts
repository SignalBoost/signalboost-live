import { cosServiceDb, createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { persistKnowledgeFactWithEmbedding } from '@/lib/ai/cos/knowledgeFactSemantic'
import {
  extractFactsFromDocument,
  toKnowledgeFact,
  type ExtractionSourceDocument,
} from '@/lib/ai/cos/knowledgeFactExtraction'
import {
  evaluateKnowledgePromotionRelevance,
  knowledgePromotionRelevanceMessage,
  ownerDirectedPromotionAuthority,
  OWNER_DIRECTED_INTENT_MARKER,
  OWNER_DIRECTED_STUDY_MARKER,
  type KnowledgePromotionCandidate,
} from '@/lib/ai/cos/knowledgePromotionRelevance'

export type AutoPromotionResult = {
  status: 'promoted' | 'skipped' | 'error'
  documentsScreened: number
  documentsProcessed: number
  documentsCompleted: number
  documentsFailed: number
  rejectedRelevance: number
  factsWritten: number
  proposed: number
  rejectedUngrounded: number
  rejectedMalformed: number
  stoppedForBudget: boolean
  error?: string
}

export type AutoPromotionOptions = {
  ownerDirectedOnly?: boolean
}

const EMPTY: Omit<AutoPromotionResult, 'status'> = {
  documentsScreened: 0,
  documentsProcessed: 0,
  documentsCompleted: 0,
  documentsFailed: 0,
  rejectedRelevance: 0,
  factsWritten: 0,
  proposed: 0,
  rejectedUngrounded: 0,
  rejectedMalformed: 0,
  stoppedForBudget: false,
}

const MIN_DOCUMENT_START_BUDGET_MS = 225_000
const MAX_AUTO_RETRIES = 3
const MAX_PROMOTION_SCREEN = 50
const PROMOTION_ROW_FIELDS = 'content_hash,source_kind,subject,summary,source_uri,source_title,confidence,fact_extraction_attempts,evidence'
const OWNER_DIRECTED_EVIDENCE = JSON.stringify([OWNER_DIRECTED_STUDY_MARKER, OWNER_DIRECTED_INTENT_MARKER])

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

function asPromotionCandidate(row: any): KnowledgePromotionCandidate {
  return {
    sourceKind: String(row.source_kind ?? ''),
    subject: String(row.subject ?? ''),
    summary: String(row.summary ?? ''),
    sourceTitle: row.source_title ? String(row.source_title) : null,
    confidence: Number(row.confidence ?? 0),
    ownerDirected: ownerDirectedPromotionAuthority(row.evidence),
  }
}

async function selectOwnerDirectedPromotionCandidates(limit: number) {
  const db = cosServiceDb()
  if (!db) return { data: [], error: null }

  const pending = await db.from('cos_continuous_learning')
    .select(PROMOTION_ROW_FIELDS)
    .contains('evidence', OWNER_DIRECTED_EVIDENCE)
    .is('fact_extraction_status', null)
    .not('summary', 'eq', '')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (pending.error || (pending.data?.length ?? 0) >= limit) return pending

  const remaining = limit - (pending.data?.length ?? 0)
  const failed = await db.from('cos_continuous_learning')
    .select(PROMOTION_ROW_FIELDS)
    .contains('evidence', OWNER_DIRECTED_EVIDENCE)
    .eq('fact_extraction_status', 'failed')
    .lt('fact_extraction_attempts', MAX_AUTO_RETRIES)
    .not('summary', 'eq', '')
    .order('fact_extraction_attempted_at', { ascending: true })
    .limit(remaining)
  if (failed.error) return failed
  return { data: [...(pending.data ?? []), ...(failed.data ?? [])], error: null }
}

async function selectGenericPromotionCandidates(limit: number) {
  const db = cosServiceDb()
  if (!db) return { data: [], error: null }

  const pending = await db.from('cos_continuous_learning')
    .select(PROMOTION_ROW_FIELDS)
    .is('fact_extraction_status', null)
    .not('summary', 'eq', '')
    .order('observed_at', { ascending: true })
    .order('confidence', { ascending: false })
    .limit(limit)
  if (pending.error || (pending.data?.length ?? 0) >= limit) return pending

  const remaining = limit - (pending.data?.length ?? 0)
  const failed = await db.from('cos_continuous_learning')
    .select(PROMOTION_ROW_FIELDS)
    .eq('fact_extraction_status', 'failed')
    .lt('fact_extraction_attempts', MAX_AUTO_RETRIES)
    .not('summary', 'eq', '')
    .order('fact_extraction_attempted_at', { ascending: true })
    .limit(remaining)
  if (failed.error) return failed
  return { data: [...(pending.data ?? []), ...(failed.data ?? [])], error: null }
}

async function selectPromotionCandidates(limit: number, options: AutoPromotionOptions = {}) {
  const owner = await selectOwnerDirectedPromotionCandidates(limit)
  if (owner.error || options.ownerDirectedOnly || (owner.data?.length ?? 0) >= limit) return owner

  // Owner-directed study has explicit acquisition intent and must not sit behind years of generic
  // corpus backlog. Fill any remaining screening slots with the normal queue while preserving the
  // existing generic ordering and deduplicating rows that appear in both queries.
  const generic = await selectGenericPromotionCandidates(limit)
  if (generic.error) return generic
  const combined = [...(owner.data ?? []), ...(generic.data ?? [])]
  return {
    data: [...new Map(combined.map((row: any) => [String(row.content_hash), row])).values()].slice(0, limit),
    error: null,
  }
}

export async function countPendingOwnerDirectedKnowledgePromotion(): Promise<number | null> {
  const db = cosServiceDb()
  if (!db) return null
  const base = () => db.from('cos_continuous_learning')
    .select('content_hash', { count: 'exact', head: true })
    .contains('evidence', OWNER_DIRECTED_EVIDENCE)
    .not('summary', 'eq', '')

  const [pending, failed] = await Promise.all([
    base().is('fact_extraction_status', null),
    base().eq('fact_extraction_status', 'failed').lt('fact_extraction_attempts', MAX_AUTO_RETRIES),
  ])
  if (pending.error || failed.error) return null
  return Math.max(0, Number(pending.count ?? 0)) + Math.max(0, Number(failed.count ?? 0))
}

async function markPromotionRejected(row: any, message: string): Promise<void> {
  const db = cosServiceDb()
  if (!db) return

  // The existing schema intentionally has only pending/completed/failed. Relevance rejection is a
  // terminal, successful PROMOTION REVIEW rather than a retryable extraction failure, so retain the
  // row and use the terminal completed state while preserving the explicit rejection reason here.
  // This keeps the historical source auditable without allowing it to starve the candidate queue.
  const { error } = await db.from('cos_continuous_learning').update({
    fact_extraction_status: 'completed',
    fact_extraction_attempted_at: new Date().toISOString(),
    fact_extraction_error: `relevance_rejected: ${message}`.slice(0, 1000),
  }).eq('content_hash', String(row.content_hash ?? ''))
  if (error) throw error
}

/**
 * Promote learned corpus documents into structured knowledge facts.
 *
 * Two independent integrity gates protect durable KG facts:
 * 1. retained-subject relevance: the stored source must still align with the curriculum subject;
 * 2. source grounding: each extracted claim must be traceable to the source excerpt.
 *
 * Owner-directed study is the bounded exception to gate 1 because relevance was explicitly
 * established by the owner before retention. It is NOT an exception to source-kind admission or
 * claim-level grounding. Generic/autonomously discovered material retains the full relevance gate.
 *
 * Grounding alone is insufficient because a historically irrelevant source can contain perfectly
 * grounded facts about the WRONG topic. The relevance re-check therefore runs before any Qwen call
 * for non-owner material. Rejected documents remain in the learned corpus for provenance/audit but
 * become terminal promotion reviews and never enter the Knowledge Graph.
 *
 * The optional deadline prevents this background task from starting model work it cannot finish.
 */
export async function autoPromoteLearnedKnowledge(
  limit = 5,
  deadlineMs?: number,
  options: AutoPromotionOptions = {},
): Promise<AutoPromotionResult> {
  const db = cosServiceDb()
  const stores = createSupabaseCOSStores()
  if (!db || !stores) {
    return { status: 'skipped', ...EMPTY, error: 'COS Supabase service store is not configured' }
  }

  let documentsScreened = 0
  let documentsProcessed = 0
  let documentsCompleted = 0
  let documentsFailed = 0
  let rejectedRelevance = 0
  let factsWritten = 0
  let proposed = 0
  let rejectedUngrounded = 0
  let rejectedMalformed = 0
  let stoppedForBudget = false
  const errors: string[] = []

  try {
    const requested = Math.max(1, Math.min(10, Math.floor(limit)))
    const screenLimit = Math.min(MAX_PROMOTION_SCREEN, Math.max(requested, requested * 8))
    const candidates = await selectPromotionCandidates(screenLimit, options)
    if (candidates.error) throw candidates.error

    const eligibleRows: any[] = []
    for (const row of candidates.data ?? []) {
      documentsScreened += 1
      const relevance = evaluateKnowledgePromotionRelevance(asPromotionCandidate(row))
      if (!relevance.eligible) {
        rejectedRelevance += 1
        await markPromotionRejected(row, knowledgePromotionRelevanceMessage(relevance))
        console.warn('[cos-learning-promotion-relevance-rejected]', JSON.stringify({
          sourceUri: String(row.source_uri ?? ''),
          subject: String(row.subject ?? ''),
          ownerDirected: ownerDirectedPromotionAuthority(row.evidence),
          reason: relevance.reason,
          matched: relevance.matchedAnchors,
          anchors: relevance.anchors,
          coverage: relevance.coverage,
        }))
        continue
      }

      if (eligibleRows.length < requested) eligibleRows.push(row)
      // Continue screening the bounded window after filling today's extraction budget. This drains
      // historical irrelevant rows quickly while leaving extra eligible rows untouched for next run.
    }

    if (eligibleRows.length === 0) {
      const result: AutoPromotionResult = {
        status: 'skipped', documentsScreened, documentsProcessed, documentsCompleted, documentsFailed,
        rejectedRelevance, factsWritten, proposed, rejectedUngrounded, rejectedMalformed, stoppedForBudget,
      }
      console.info('[cos-learning-auto-promotion]', JSON.stringify(result))
      return result
    }

    const reasoner = resolveCosReasoner()
    if (!reasoner.config) {
      return {
        status: 'error', documentsScreened, documentsProcessed, documentsCompleted, documentsFailed,
        rejectedRelevance, factsWritten, proposed, rejectedUngrounded, rejectedMalformed, stoppedForBudget,
        error: 'reason' in reasoner ? reasoner.reason : 'COS local reasoner is not configured',
      }
    }

    for (const row of eligibleRows) {
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
      documentsScreened,
      documentsProcessed,
      documentsCompleted,
      documentsFailed,
      rejectedRelevance,
      factsWritten,
      proposed,
      rejectedUngrounded,
      rejectedMalformed,
      stoppedForBudget,
      ...(errors.length ? { error: errors.join(' | ').slice(0, 2000) } : {}),
    }
    console.info('[cos-learning-auto-promotion]', JSON.stringify({ ...result, ownerDirectedOnly: Boolean(options.ownerDirectedOnly) }))
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cos-learning-auto-promotion-failed]', message)
    return {
      status: 'error', documentsScreened, documentsProcessed, documentsCompleted, documentsFailed,
      rejectedRelevance, factsWritten, proposed, rejectedUngrounded, rejectedMalformed, stoppedForBudget,
      error: message,
    }
  }
}
