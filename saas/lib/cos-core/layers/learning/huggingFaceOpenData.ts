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
} as const)

const DATASET_SERVER = 'https://datasets-server.huggingface.co'
const REQUEST_TIMEOUT_MS = 12_000

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

async function getJson(url: string, fetcher: FetchLike): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetcher(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'iTMounts-COS/1.0',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`COS Hugging Face open-data source failed: ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
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
    const params = new URLSearchParams({
      dataset: source.dataset,
      config: source.config,
      split: source.split,
      query: q,
      offset: '0',
      length: String(Math.min(Math.max(1, limit), 10)),
    })
    const json = await getJson(`${DATASET_SERVER}/search?${params.toString()}`, fetcher)
    return (json?.rows ?? []).map((entry: any): LearningConnectorResult | null => {
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
    const params = new URLSearchParams({
      dataset: source.dataset,
      config: source.config,
      split: source.split,
      query: q,
      offset: '0',
      length: String(Math.min(Math.max(1, limit), 10)),
    })
    const json = await getJson(`${DATASET_SERVER}/search?${params.toString()}`, fetcher)
    return (json?.rows ?? []).map((entry: any): LearningConnectorResult | null => {
      const row = entry?.row ?? {}
      const body = clean(row?.text, 40_000)
      if (!body) return null

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
          repoName ? `github_repo:${repoName}` : '',
          language ? `repo_language:${language}` : '',
          fileName ? `repo_file:${fileName}` : '',
          mimeType ? `repo_mime:${mimeType}` : '',
        ].filter(Boolean),
      }
    }).filter((item: LearningConnectorResult | null): item is LearningConnectorResult => Boolean(item?.uri && item.text))
  }
}
