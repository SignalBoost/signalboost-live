// saas/lib/cos-core/layers/learning/semanticResearch.ts
import { createHash } from 'node:crypto'
import type { LearningConnectorResult, LearningConnectorSearch } from './connectors.ts'
import { abstractFromInvertedIndex, openAlexAbstractIsSubstantive } from './openAlexAbstract.ts'

type FetchLike = typeof fetch

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

function clean(value: unknown, limit = 60_000): string {
  return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function semanticQuery(value: string): string {
  return clean(value, 1_800)
}

async function getJson(url: string, fetcher: FetchLike = fetch, headers: Record<string, string> = {}): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetcher(url, {
      headers: { accept: 'application/json', 'user-agent': 'iTMounts-COS/1.0', ...headers },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`COS semantic research source failed: ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function boundedScore(value: unknown): string | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(-1, Math.min(1, numeric)).toFixed(6)
}

function vectorDigest(value: unknown, dimensions: number): string | null {
  if (!Array.isArray(value) || value.length !== dimensions) return null
  const vector = value.map(Number)
  if (vector.some(item => !Number.isFinite(item))) return null
  return createHash('sha256').update(JSON.stringify(vector)).digest('hex')
}

function doiUri(value: unknown): string {
  const raw = clean(value, 400)
  if (!raw) return ''
  return raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://doi.org/${raw.replace(/^doi:/i, '')}`
}

/**
 * OpenAlex operates its 1,024-dimensional GTE-Large-EN index remotely. iTMounts sends a bounded
 * natural-language query and receives semantically ranked works. Those external vectors are never
 * inserted into the internal pgvector space because model spaces are not interchangeable.
 */
export function createOpenAlexSemanticScientificSearch(fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    const q = semanticQuery(query)
    if (!q) return []
    const space = EXTERNAL_SEMANTIC_VECTOR_SPACES.openalex_gte_large_en
    const params = new URLSearchParams({
      'search.semantic': q,
      'per-page': String(Math.min(Math.max(1, limit), 10)),
      select: 'id,doi,title,publication_year,abstract_inverted_index,open_access,primary_topic,relevance_score',
    })
    const json = await getJson(`https://api.openalex.org/works?${params.toString()}`, fetcher)
    return (json?.results ?? []).map((item: any): LearningConnectorResult => {
      const title = clean(item?.title, 1_000)
      const abstract = clean(abstractFromInvertedIndex(item?.abstract_inverted_index), 40_000)
      const topic = clean(item?.primary_topic?.display_name, 500)
      const year = Number.isFinite(Number(item?.publication_year)) ? String(item.publication_year) : ''
      const score = boundedScore(item?.relevance_score)
      const text = clean([title, abstract, topic ? `Topic: ${topic}.` : '', year ? `Published: ${year}.` : ''].filter(Boolean).join(' '))
      return {
        uri: doiUri(item?.doi) || clean(item?.id, 800),
        title,
        text,
        license: openAlexAbstractIsSubstantive(abstract)
          ? 'OpenAlex CC0 abstract read for grounded learning; COS retains only facts, summary, and provenance'
          : (item?.open_access?.is_oa ? 'open-access metadata discovered through OpenAlex semantic index' : 'metadata discovered through OpenAlex semantic index'),
        evidence: [
          `external_semantic_index:${space.vectorSpace}`,
          `external_vector_dimensions:${space.dimensions}`,
          score ? `external_semantic_score:${score}` : '',
        ].filter(Boolean),
      }
    }).filter((item: LearningConnectorResult) => Boolean(item.uri && item.text))
  }
}

export const openAlexSemanticScientificSearch = createOpenAlexSemanticScientificSearch()


/**
 * Semantic Scholar exposes precomputed SPECTER2 proximity vectors for scientific papers. iTMounts
 * validates and fingerprints the source vector for provenance, but does not mix it into the
 * platform's internal embedding space. Retained text can be embedded again with the active iTMounts
 * embedding model after the ordinary learning-admission gates accept it.
 */
export function createSemanticScholarScientificSearch(options: {
  fetcher?: FetchLike
  apiKey?: string
} = {}): LearningConnectorSearch {
  const fetcher = options.fetcher ?? fetch
  const apiKey = String(options.apiKey ?? '').trim()
  return async (query, limit) => {
    const q = semanticQuery(query)
    if (!q) return []
    const space = EXTERNAL_SEMANTIC_VECTOR_SPACES.semantic_scholar_specter2
    const params = new URLSearchParams({
      query: q,
      limit: String(Math.min(Math.max(1, limit), 10)),
      fields: 'title,url,abstract,year,citationCount,externalIds,embedding.specter_v2',
    })
    const json = await getJson(
      `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
      fetcher,
      apiKey ? { 'x-api-key': apiKey } : {},
    )
    return (json?.data ?? []).map((item: any): LearningConnectorResult | null => {
      const digest = vectorDigest(item?.embedding?.vector, space.dimensions)
      if (!digest) return null
      const title = clean(item?.title, 1_000)
      const abstract = clean(item?.abstract, 40_000)
      const year = Number.isFinite(Number(item?.year)) ? String(item.year) : ''
      const citations = Number.isFinite(Number(item?.citationCount)) ? String(item.citationCount) : ''
      const text = clean([
        title,
        abstract,
        year ? `Published: ${year}.` : '',
        citations ? `Citations: ${citations}.` : '',
      ].filter(Boolean).join(' '))
      const uri = clean(item?.url, 800)
        || doiUri(item?.externalIds?.DOI)
        || (item?.paperId ? `https://www.semanticscholar.org/paper/${encodeURIComponent(String(item.paperId))}` : '')
      return {
        uri,
        title,
        text,
        license: 'Semantic Scholar metadata/abstract with SPECTER2 discovery vector; training rights not asserted',
        evidence: [
          `external_semantic_index:${space.vectorSpace}`,
          `external_vector_dimensions:${space.dimensions}`,
          `external_vector_sha256:${digest}`,
        ],
      }
    }).filter((item: LearningConnectorResult | null): item is LearningConnectorResult => Boolean(item?.uri && item.text))
  }
}
