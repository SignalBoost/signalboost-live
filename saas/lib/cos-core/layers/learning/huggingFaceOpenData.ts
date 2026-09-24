// saas/lib/cos-core/layers/learning/huggingFaceOpenData.ts
import { createHash } from 'node:crypto'
import type { LearningConnectorResult, LearningConnectorSearch } from './connectors.ts'

type FetchLike = typeof fetch

export const HUGGING_FACE_OPEN_DATASETS = Object.freeze({
  nistCybersecurity: Object.freeze({
    dataset: 'ethanolivertroy/nist-cybersecurity-training',
    config: 'default',
    split: 'train',
    license: 'cc0-1.0',
    vectorDimensions: 1536,
    mode: 'preembedded_cc0_dataset_search',
  }),
  githubCc0: Object.freeze({
    dataset: 'KoalaAI/GitHub-CC0',
    config: 'default',
    split: 'train',
    license: 'cc0-1.0',
    vectorDimensions: null,
    mode: 'cc0_code_corpus_search',
  }),
  arxivMetadata: Object.freeze({
    dataset: 'librarian-bots/arxiv-metadata-snapshot',
    config: 'default',
    split: 'train',
    license: 'cc0-1.0',
    vectorDimensions: null,
    mode: 'searchable_cc0_research_metadata',
  }),
} as const)

const DATASET_SERVER = 'https://datasets-server.huggingface.co'
const SEARCH_REQUEST_TIMEOUT_MS = 6_000
const ROWS_REQUEST_TIMEOUT_MS = 10_000

function clean(value: unknown, limit = 60_000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function queryText(value: string): string {
  return clean(value, 600)
}

function metadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  const text = clean(value, 4000)
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function vectorDigest(value: unknown, dimensions: number): string | null {
  if (!Array.isArray(value) || value.length !== dimensions) return null
  const vector = value.map(Number)
  if (vector.some(item => !Number.isFinite(item))) return null
  return createHash('sha256').update(JSON.stringify(vector)).digest('hex')
}

type DatasetAccessResult = Readonly<{ rows: any[]; mode: 'search' | 'search_relaxed' | 'rows_fallback' | 'first_rows_fallback' }>

async function getJsonResponse(
  url: string,
  fetcher: FetchLike,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; body: any }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'iTMounts-COS/1.0',
      },
      signal: controller.signal,
    })
    let body: any = {}
    let validJson = false
    try {
      body = await response.json()
      validJson = true
    } catch {}
    // Hugging Face's Viewer can occasionally return an HTML error document with HTTP 200. Treating
    // that as a successful empty JSON response hid the provider failure as "zero results" and starved
    // the distillation lane. Only a parseable JSON response is successful here.
    return { ok: response.ok && validJson, status: response.status, body }
  } catch (error) {
    // Dataset Viewer search is best-effort. A timeout/network abort must remain observable but it must
    // not prevent the bounded /rows fallback from running, otherwise one slow search endpoint opens the
    // source circuit even though the dataset itself is still readable.
    const timedOut = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
    return { ok: false, status: timedOut ? 408 : 0, body: {} }
  } finally {
    clearTimeout(timer)
  }
}
function deterministicOffset(dataset: string, query: string): number {
  const digest = createHash('sha256').update(`${dataset}\n${query}`).digest('hex')
  return Number.parseInt(digest.slice(0, 8), 16) % 50_000
}

const QUERY_STOP_WORDS = new Set(['within','findings','methods','evidence','systematic','review','comparative','analysis','applications','limitations','measurement','validation','rigorous','reusable','strengthen','computer','science','coding'])

function compactQueryTerms(query: string, preferred: readonly string[], fallback: string): string[] {
  const normalized = clean(query, 600).toLowerCase()
  const chosen = preferred.filter(term => normalized.includes(term)).slice(0, 3)
  const lexical = normalized.split(/[^a-z0-9+#.-]+/).map(term => term.trim()).filter(term => term.length >= 3 && !QUERY_STOP_WORDS.has(term))
  const lexicalCompact = [...new Set(lexical)].slice(0, 3).join(' ')
  return [...new Set([chosen.join(' '), lexicalCompact, fallback].map(value => value.trim()).filter(value => value && value !== normalized))].slice(0, 2)
}

function relaxedQueriesForDataset(dataset: string, query: string): string[] {
  if (dataset === HUGGING_FACE_OPEN_DATASETS.githubCc0.dataset) {
    return compactQueryTerms(query, [
      'typescript','javascript','python','react','next.js','node.js','api','database','sql','supabase',
      'vercel','debugging','testing','devops','git','github','algorithm','data structure','architecture',
      'software','programming','code',
    ], 'software code')
  }
  if (dataset === HUGGING_FACE_OPEN_DATASETS.nistCybersecurity.dataset) {
    return compactQueryTerms(query, [
      'zero trust','incident response','risk management','access control','identity','cryptography',
      'post-quantum','privacy','supply chain','cybersecurity','security','nist',
    ], 'cybersecurity security')
  }
  return compactQueryTerms(query, ['machine learning','artificial intelligence','retrieval','embedding','database','statistics','physics','quantum','economics'], 'research')
}

function githubSoftwareLike(row: any): boolean {
  const meta = metadataRecord(row?.meta)
  const language = clean(meta.repo_language, 120).toLowerCase()
  const fileName = clean(meta.file_name, 500).toLowerCase()
  const mimeType = clean(meta.mime_type, 160).toLowerCase()
  const body = clean(row?.text, 4000)
  if (/\b(typescript|javascript|python|java|go|golang|rust|c\+\+|c#|ruby|php|swift|kotlin|scala|shell|sql)\b/.test(language)) return true
  if (/\.(ts|tsx|js|jsx|mjs|cjs|py|java|go|rs|sql|cs|cpp|cc|c|h|hpp|rb|php|swift|kt|kts|scala|sh|bash|zsh|yaml|yml|json|toml)$/i.test(fileName)) return true
  if (/\b(text\/(javascript|typescript|x-python)|application\/(javascript|json)|text\/x-(python|java|c|c\+\+))\b/i.test(mimeType)) return true
  return /\b(import\s+.+from|export\s+(async\s+)?(function|const|class)|async\s+function|function\s+\w+\s*\(|class\s+\w+|interface\s+\w+|def\s+\w+\s*\(|SELECT\s+.+FROM|CREATE\s+TABLE|package\s+\w+|public\s+static\s+|fn\s+\w+\s*\()/i.test(body)
}

/**
 * Dataset Viewer search is not guaranteed for every Hub dataset even when the Hub page advertises a
 * Viewer. Search can be disabled or temporarily fail while ordinary bounded row access still works.
 * Try semantic-ish BM25 search first, then one deterministic small row slice. If both are unavailable,
 * fail closed so source health remains visible to the learning circuit/cooldown layer.
 */
async function readDatasetRows(source: { dataset: string; config: string; split: string }, query: string, limit: number, fetcher: FetchLike): Promise<DatasetAccessResult> {
  const length = String(Math.min(Math.max(1, limit), 10))
  const search = async (candidateQuery: string) => {
    const searchParams = new URLSearchParams({
      dataset: source.dataset,
      config: source.config,
      split: source.split,
      query: candidateQuery,
      offset: '0',
      length,
    })
    return getJsonResponse(`${DATASET_SERVER}/search?${searchParams.toString()}`, fetcher, SEARCH_REQUEST_TIMEOUT_MS)
  }

  const searched = await search(query)
  const searchedRows = Array.isArray(searched.body?.rows) ? searched.body.rows : []
  if (searched.ok && searchedRows.length > 0) return { rows: searchedRows, mode: 'search' }

  // A healthy BM25 endpoint returning no rows usually means the University query is too specific,
  // not that the dataset is empty. Relax only the query, never the rights/admission gates.
  if (searched.ok) {
    for (const relaxedQuery of relaxedQueriesForDataset(source.dataset, query)) {
      const relaxed = await search(relaxedQuery)
      const relaxedRows = Array.isArray(relaxed.body?.rows) ? relaxed.body.rows : []
      if (relaxed.ok && relaxedRows.length > 0) return { rows: relaxedRows, mode: 'search_relaxed' }
      if (!relaxed.ok) break
    }
  }

  // Only use arbitrary bounded row access when search transport itself is unavailable. A successful
  // search with no matching rows must not degrade into unrelated corpus samples.
  if (searched.ok) return { rows: [], mode: 'search_relaxed' }
  const primaryOffset = deterministicOffset(source.dataset, query) % 10_000
  const rowParams = new URLSearchParams({
    dataset: source.dataset,
    config: source.config,
    split: source.split,
    offset: String(primaryOffset),
    length,
  })
  let fallback = await getJsonResponse(`${DATASET_SERVER}/rows?${rowParams.toString()}`, fetcher, ROWS_REQUEST_TIMEOUT_MS)
  let fallbackRows = Array.isArray(fallback.body?.rows) ? fallback.body.rows : []

  // One bounded zero-offset retry prevents an out-of-range deterministic slice from masquerading as
  // an empty dataset. This does not widen admission, rights, relevance, or per-cycle provider authority.
  if (fallback.ok && fallbackRows.length === 0 && primaryOffset !== 0) {
    rowParams.set('offset', '0')
    fallback = await getJsonResponse(`${DATASET_SERVER}/rows?${rowParams.toString()}`, fetcher, ROWS_REQUEST_TIMEOUT_MS)
    fallbackRows = Array.isArray(fallback.body?.rows) ? fallback.body.rows : []
  }
  if (fallback.ok && fallbackRows.length > 0) return { rows: fallbackRows, mode: 'rows_fallback' }

  // /search and /rows are generated on demand and can both be unavailable while Hugging Face's cached
  // /first-rows result is healthy. Use that cache only as the final bounded fallback, then choose a
  // deterministic query-specific window so different curriculum queries do not all consume the same
  // leading examples. Admission/relevance/deduplication still decide whether any selected row is retained.
  const firstParams = new URLSearchParams({
    dataset: source.dataset,
    config: source.config,
    split: source.split,
  })
  const first = await getJsonResponse(`${DATASET_SERVER}/first-rows?${firstParams.toString()}`, fetcher, ROWS_REQUEST_TIMEOUT_MS)
  const firstRows = Array.isArray(first.body?.rows) ? first.body.rows : []
  if (first.ok && firstRows.length > 0) {
    const wanted = Math.min(Number(length), firstRows.length)
    const start = deterministicOffset(source.dataset, query) % firstRows.length
    const selected = Array.from({ length: wanted }, (_, index) => firstRows[(start + index) % firstRows.length])
    return { rows: selected, mode: 'first_rows_fallback' }
  }

  const searchState = searched.ok ? '200-empty' : String(searched.status)
  const rowsState = fallback.ok ? '200-empty' : String(fallback.status)
  const firstState = first.ok ? '200-empty' : String(first.status)
  throw new Error(`COS Hugging Face open-data source failed: dataset=${source.dataset}:search=${searchState}:rows=${rowsState}:first_rows=${firstState}`)
}

/**
 * Free, explicitly CC0/public-domain NIST curriculum exposed through Hugging Face's Dataset Viewer.
 *
 * The provider's 1,536-dimensional source embedding is fingerprinted for provenance only. It is not
 * inserted into iTMounts pgvector because external vector spaces are not interchangeable with the
 * platform's active embedding model. Accepted retained text is re-embedded internally by the normal
 * continuous-learning storage path.
 */
export function createHuggingFaceNistCybersecuritySearch(fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    const q = queryText(query)
    if (!q) return []
    const source = HUGGING_FACE_OPEN_DATASETS.nistCybersecurity
    const accessed = await readDatasetRows(source, q, limit, fetcher)
    return accessed.rows.map((entry: any): LearningConnectorResult | null => {
      const row = entry?.row ?? {}
      const text = clean(row?.text, 40_000)
      if (!text) return null
      const vectorSha = vectorDigest(row?.embedding, source.vectorDimensions)
      if (!vectorSha) return null

      const metadata = metadataRecord(row?.metadata)
      const sourceTitle = clean(metadata.source, 1000) || 'NIST cybersecurity training material'
      const rowIndex = Number.isFinite(Number(entry?.row_idx)) ? Math.max(0, Math.floor(Number(entry.row_idx))) : null
      const uri = rowIndex === null
        ? `hf://datasets/${source.dataset}#${source.split}`
        : `hf://datasets/${source.dataset}#${source.split}:${rowIndex}`

      return {
        uri,
        title: sourceTitle,
        text,
        license: 'cc0 public-domain NIST cybersecurity training dataset; source publications are public domain',
        evidence: [
          `huggingface_dataset:${source.dataset}`,
          `huggingface_dataset_license:${source.license}`,
          `external_vector_dimensions:${source.vectorDimensions}`,
          `external_vector_sha256:${vectorSha}`,
          'external_vector_imported:false',
          `huggingface_access_mode:${accessed.mode}`,
          metadata.type ? `dataset_material_type:${clean(metadata.type, 120)}` : '',
        ].filter(Boolean),
      }
    }).filter((item: LearningConnectorResult | null): item is LearningConnectorResult => Boolean(item?.uri && item.text))
  }
}


/**
 * Free CC0/public-domain software corpus from GitHub repositories selected for CC0 content.
 *
 * This dataset does not provide a compatible external embedding column. The original text is
 * discovered through Hugging Face Dataset Viewer search, retained only after the ordinary learning
 * gates pass, and then embedded by iTMounts using the active canonical embedding model. Repository,
 * language, filename and MIME provenance stay attached to the retained learning item.
 */
export function createHuggingFaceGithubCc0Search(fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    const q = queryText(query)
    if (!q) return []
    const source = HUGGING_FACE_OPEN_DATASETS.githubCc0
    const accessed = await readDatasetRows(source, q, limit, fetcher)
    return accessed.rows.map((entry: any): LearningConnectorResult | null => {
      const row = entry?.row ?? {}
      const body = clean(row?.text, 40_000)
      if (!body || !githubSoftwareLike(row)) return null

      const meta = metadataRecord(row?.meta)
      const repoName = clean(meta.repo_name, 500)
      const language = clean(meta.repo_language, 120)
      const fileName = clean(meta.file_name, 500)
      const mimeType = clean(meta.mime_type, 160)
      const rowIndex = Number.isFinite(Number(entry?.row_idx)) ? Math.max(0, Math.floor(Number(entry.row_idx))) : null
      const uri = rowIndex === null
        ? `hf://datasets/${source.dataset}#${source.split}`
        : `hf://datasets/${source.dataset}#${source.split}:${rowIndex}`
      const title = [repoName, fileName].filter(Boolean).join(' / ') || 'GitHub CC0 software material'

      return {
        uri,
        title,
        text: body,
        license: 'cc0 public-domain GitHub-CC0 software corpus',
        evidence: [
          `huggingface_dataset:${source.dataset}`,
          `huggingface_dataset_license:${source.license}`,
          'external_vector_imported:false',
          'canonical_embedding_required:true',
          `huggingface_access_mode:${accessed.mode}`,
          repoName ? `github_repo:${repoName}` : '',
          language ? `repo_language:${language}` : '',
          fileName ? `repo_file:${fileName}` : '',
          mimeType ? `repo_mime:${mimeType}` : '',
        ].filter(Boolean),
      }
    }).filter((item: LearningConnectorResult | null): item is LearningConnectorResult => Boolean(item?.uri && item.text))
  }
}


/**
 * CC0 arXiv metadata mirror maintained on Hugging Face. This is a research-discovery source, not a
 * declaration that the underlying paper text is CC0 or training-eligible. The retained title and
 * abstract stay available for governed RAG/learning, and accepted material is embedded internally.
 */
export function createHuggingFaceArxivMetadataSearch(fetcher: FetchLike = fetch): LearningConnectorSearch {
  return async (query, limit) => {
    const q = queryText(query)
    if (!q) return []
    const source = HUGGING_FACE_OPEN_DATASETS.arxivMetadata
    const accessed = await readDatasetRows(source, q, limit, fetcher)
    return accessed.rows.map((entry: any): LearningConnectorResult | null => {
      const row = entry?.row ?? {}
      const title = clean(row?.title, 1000)
      const abstract = clean(row?.abstract, 40_000)
      if (!title || !abstract) return null
      const arxivId = clean(row?.id, 120)
      const categories = clean(row?.categories, 500)
      const updated = clean(row?.update_date, 80)
      const doi = clean(row?.doi, 300)
      const rowIndex = Number.isFinite(Number(entry?.row_idx)) ? Math.max(0, Math.floor(Number(entry.row_idx))) : null
      const uri = rowIndex === null
        ? `hf://datasets/${source.dataset}#${source.split}`
        : `hf://datasets/${source.dataset}#${source.split}:${rowIndex}`
      const text = clean([
        title,
        abstract,
        categories ? `arXiv categories: ${categories}.` : '',
        updated ? `Metadata updated: ${updated}.` : '',
      ].filter(Boolean).join(' '), 40_000)

      return {
        uri,
        title,
        text,
        // Deliberately does not start with "cc0": mass-distillation training rights for underlying
        // papers are not inferred from the metadata mirror's catalog license.
        license: 'research metadata mirror; catalog metadata is CC0; underlying paper training rights not asserted',
        evidence: [
          `huggingface_dataset:${source.dataset}`,
          `huggingface_dataset_license:${source.license}`,
          `huggingface_access_mode:${accessed.mode}`,
          'external_vector_imported:false',
          'canonical_embedding_required:true',
          arxivId ? `arxiv_id:${arxivId}` : '',
          doi ? `doi:${doi}` : '',
          categories ? `arxiv_categories:${categories}` : '',
        ].filter(Boolean),
      }
    }).filter((item: LearningConnectorResult | null): item is LearningConnectorResult => Boolean(item?.uri && item.text))
  }
}
