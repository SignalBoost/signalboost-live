import type { KnowledgeGap } from './index'
import type { ContinuousLearningSourceAdapter, LearningSourceDocument } from './cycle'

export type LearningSourceFetcher = (gap: KnowledgeGap) => Promise<LearningSourceDocument[]>

/**
 * Explicit allow-listed adapter. Acquisition mechanics are injected so COS can use APIs,
 * licensed corpora, internal repositories or other approved sources without embedding
 * arbitrary crawling or provider-specific behavior in the learning layer.
 */
export class ApprovedLearningSourceAdapter implements ContinuousLearningSourceAdapter {
  constructor(
    readonly kind: LearningSourceDocument['sourceKind'],
    private readonly fetcher: LearningSourceFetcher,
  ) {}

  async acquire(gap: KnowledgeGap): Promise<LearningSourceDocument[]> {
    const documents = await this.fetcher(gap)
    return documents.filter((document) => document.sourceKind === this.kind && Boolean(document.sourceUri && document.subject && document.text.trim()))
  }
}

export function staticLearningSourceAdapter(
  kind: LearningSourceDocument['sourceKind'],
  documents: LearningSourceDocument[],
): ContinuousLearningSourceAdapter {
  return new ApprovedLearningSourceAdapter(kind, async (gap) =>
    documents.filter((document) => {
      const haystack = `${document.subject} ${document.sourceTitle ?? ''} ${document.text}`.toLowerCase()
      return gap.topics.some((topic) => haystack.includes(topic.toLowerCase()))
    }),
  )
}
