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

function gapTerms(gap: KnowledgeGap): string[] {
  return [gap.subject, gap.question, ...gap.evidence]
    .flatMap((value) => value.toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
}

export function staticLearningSourceAdapter(
  kind: LearningSourceDocument['sourceKind'],
  documents: LearningSourceDocument[],
): ContinuousLearningSourceAdapter {
  return new ApprovedLearningSourceAdapter(kind, async (gap) => {
    const terms = gapTerms(gap)
    return documents.filter((document) => {
      const haystack = `${document.subject} ${document.sourceTitle ?? ''} ${document.text}`.toLowerCase()
      return terms.some((term) => haystack.includes(term))
    })
  })
}
