import type { KnowledgeGap } from './index'
import type { ContinuousLearningSourceAdapter, LearningSourceDocument } from './cycle'

export type LearningConnectorResult = {
  uri: string
  title?: string
  text: string
  observedAt?: string
  license?: string
}

export type LearningConnectorSearch = (query: string, limit: number) => Promise<LearningConnectorResult[]>

/**
 * Provider-neutral connector for approved search/API clients. Network/auth details stay
 * outside COS; this layer converts approved results into governed learning documents.
 */
export class SearchLearningConnector implements ContinuousLearningSourceAdapter {
  constructor(
    readonly kind: LearningSourceDocument['sourceKind'],
    private readonly search: LearningConnectorSearch,
    private readonly maxResults = 5,
  ) {}

  async acquire(gap: KnowledgeGap): Promise<LearningSourceDocument[]> {
    const query = [gap.subject, gap.question].filter(Boolean).join(' ').trim()
    if (!query) return []
    const results = await this.search(query, this.maxResults)
    return results
      .filter((result) => Boolean(result.uri && result.text.trim()))
      .slice(0, this.maxResults)
      .map((result) => ({
        sourceKind: this.kind,
        sourceUri: result.uri,
        sourceTitle: result.title,
        observedAt: result.observedAt ?? new Date().toISOString(),
        subject: gap.subject,
        text: result.text,
        license: result.license,
      }))
  }
}

export const youtubeLearningConnector = (search: LearningConnectorSearch, maxResults = 5) =>
  new SearchLearningConnector('video_transcript', search, maxResults)

export const libraryLearningConnector = (search: LearningConnectorSearch, maxResults = 5) =>
  new SearchLearningConnector('library_material', search, maxResults)

export const scientificLearningConnector = (search: LearningConnectorSearch, maxResults = 5) =>
  new SearchLearningConnector('scientific_journal', search, maxResults)

export const newsLearningConnector = (search: LearningConnectorSearch, maxResults = 5) =>
  new SearchLearningConnector('news_article', search, maxResults)

export const officialDocsLearningConnector = (search: LearningConnectorSearch, maxResults = 5) =>
  new SearchLearningConnector('official_documentation', search, maxResults)

export const datasetLearningConnector = (search: LearningConnectorSearch, maxResults = 5) =>
  new SearchLearningConnector('public_dataset', search, maxResults)
