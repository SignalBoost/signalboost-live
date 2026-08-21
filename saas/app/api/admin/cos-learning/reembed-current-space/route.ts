import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { embeddingModelName } from '@/lib/ai/cos/embeddingEndpoint'
import { backfillKnowledgeFactEmbeddings } from '@/lib/ai/cos/knowledgeFactSemantic'
import { backfillLearnedCorpusEmbeddings, getLearnedCorpusEmbeddingStats } from '@/lib/ai/cos/learnedCorpusSemantic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 8
const MAX_ROUNDS = 24

/**
 * Owner-only, idempotent vector-space migration.
 *
 * Use after LOCAL_AI_EMBEDDING_MODEL changes. Equal vector dimensions do NOT make two embedding
 * models compatible. This drains facts + eligible learned corpus rows that are missing a vector or
 * whose embedding_model differs from the active model. Relevance-rejected corpus rows remain
 * quarantined. Semantic answer-cache rows are not rewritten: the cache policy partitions them by
 * embedding model, so historical rows remain inert and auditable.
 */
export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const startedAt = Date.now()
  const model = embeddingModelName()
  let factAttempted = 0
  let factEmbedded = 0
  let factFailed = 0
  let factRemaining: number | null = null
  let corpusAttempted = 0
  let corpusEmbedded = 0
  let corpusFailed = 0
  let corpusRemaining: number | null = null
  let rounds = 0
  const errors: string[] = []

  try {
    for (let index = 0; index < MAX_ROUNDS; index += 1) {
      const [facts, corpus] = await Promise.all([
        backfillKnowledgeFactEmbeddings(BATCH_SIZE),
        backfillLearnedCorpusEmbeddings(BATCH_SIZE),
      ])
      rounds += 1
      factAttempted += facts.attempted
      factEmbedded += facts.embedded
      factFailed += facts.failed
      factRemaining = facts.remaining
      corpusAttempted += corpus.attempted
      corpusEmbedded += corpus.embedded
      corpusFailed += corpus.failed
      corpusRemaining = corpus.remaining
      if (facts.error) errors.push(`facts:${facts.error}`)
      if (corpus.error) errors.push(`corpus:${corpus.error}`)

      if (facts.remaining === 0 && corpus.remaining === 0) break
      if (facts.attempted === 0 && corpus.attempted === 0) break
      if (facts.embedded === 0 && corpus.embedded === 0) break
    }

    const corpusStats = await getLearnedCorpusEmbeddingStats()
    corpusRemaining = corpusStats.pending
    const completed = factRemaining === 0 && corpusRemaining === 0
    const ok = completed && factFailed === 0 && corpusFailed === 0

    return NextResponse.json({
      ok,
      completed,
      embeddingModel: model,
      facts: { attempted: factAttempted, embedded: factEmbedded, failed: factFailed, remaining: factRemaining },
      corpus: {
        attempted: corpusAttempted,
        embedded: corpusEmbedded,
        failed: corpusFailed,
        remaining: corpusRemaining,
        total: corpusStats.total,
        eligible: corpusStats.eligible,
        eligibleEmbedded: corpusStats.eligibleEmbedded,
        rejected: corpusStats.rejected,
      },
      rounds,
      batchSize: BATCH_SIZE,
      durationMs: Date.now() - startedAt,
      ...(errors.length ? { errors: errors.slice(0, 12) } : {}),
    }, { status: ok ? 200 : 503 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      completed: false,
      embeddingModel: model,
      facts: { attempted: factAttempted, embedded: factEmbedded, failed: factFailed, remaining: factRemaining },
      corpus: { attempted: corpusAttempted, embedded: corpusEmbedded, failed: corpusFailed, remaining: corpusRemaining },
      rounds,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
