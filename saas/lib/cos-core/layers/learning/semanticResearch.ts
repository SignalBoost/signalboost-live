// saas/lib/cos-core/layers/learning/semanticResearch.ts
import type { LearningConnectorSearch } from './connectors.ts'

export const EXTERNAL_SEMANTIC_VECTOR_SPACES = Object.freeze({
  openalex_gte_large_en: Object.freeze({
    provider: 'openalex',
    vectorSpace: 'openalex_gte_large_en_v1',
    dimensions: 1024,
    mode: 'remote_semantic_index',
  }),
  semantic_scholar_specter2: Object.freeze({
    provider: 'semantic_scholar',
    vectorSpace: 'semantic_scholar_specter2_proximity_v2',
    dimensions: 768,
    mode: 'precomputed_document_vector',
  }),
} as const)

export const emptySemanticResearchSearch: LearningConnectorSearch = async () => []
