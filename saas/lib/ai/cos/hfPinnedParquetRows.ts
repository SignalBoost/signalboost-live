import { parquetReadObjects } from 'hyparquet'

const HEX40 = /^[a-f0-9]{40}$/i
const MAX_PARQUET_FILES = 8
const MAX_PARQUET_FILE_BYTES = 8 * 1024 * 1024
const MAX_ROWS = 100

type HfSibling = Readonly<{ rfilename?: unknown }>
type HfTreeEntry = Readonly<{ path?: unknown; type?: unknown }>

export type PinnedParquetRow = Readonly<{ text: string; item_hash: string }>

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').trim().slice(0, max)
}

function encodeRepoId(repoId: string): string {
  const parts = repoId.split('/')
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error('distilled_evaluation_hf_repo_invalid')
  }
  return parts.map(encodeURIComponent).join('/')
}

function encodeRepoPath(path: string): string {
  const parts = path.split('/').filter(Boolean)
  if (!parts.length || parts.some(part => part === '.' || part === '..')) {
    throw new Error('distilled_evaluation_hf_path_invalid')
  }
  return parts.map(encodeURIComponent).join('/')
}

function splitParquetMatcher(split: string): RegExp {
  const escaped = split.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|/)${escaped}(?:-\\d{5}-of-\\d{5})?\\.parquet$`, 'i')
}

function parquetPathsFromSiblings(siblings: readonly HfSibling[], split: string): string[] {
  const matcher = splitParquetMatcher(split)
  return [...new Set(
    siblings
      .map(item => clean(item?.rfilename, 2000))
      .filter(path => path && matcher.test(path)),
  )].sort()
}

async function readResponseBodyBounded(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new Error('distilled_evaluation_hf_pinned_parquet_size_ceiling')
  }

  if (!response.body) {
    const file = await response.arrayBuffer()
    if (file.byteLength > maxBytes) throw new Error('distilled_evaluation_hf_pinned_parquet_size_ceiling')
    return file
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('distilled_evaluation_hf_pinned_parquet_size_ceiling').catch(() => undefined)
        throw new Error('distilled_evaluation_hf_pinned_parquet_size_ceiling')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined.buffer
}

async function listPinnedParquetPaths(input: {
  repoId: string
  revision: string
  split: string
  token: string
  siblings?: readonly HfSibling[]
  fetchImpl: typeof fetch
}): Promise<string[]> {
  const fromMetadata = parquetPathsFromSiblings(input.siblings || [], input.split)
  if (fromMetadata.length) return fromMetadata

  const repo = encodeRepoId(input.repoId)
  const treeUrl = new URL(`https://huggingface.co/api/datasets/${repo}/tree/${encodeURIComponent(input.revision)}`)
  treeUrl.searchParams.set('recursive', 'true')
  treeUrl.searchParams.set('expand', 'false')
  const response = await input.fetchImpl(treeUrl, {
    headers: { Authorization: `Bearer ${input.token}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`distilled_evaluation_hf_tree_http_${response.status}`)
  const tree: unknown = await response.json()
  if (!Array.isArray(tree)) throw new Error('distilled_evaluation_hf_tree_invalid')
  const siblings = tree.map((item: HfTreeEntry) => ({
    rfilename: item?.type === 'file' ? item?.path : null,
  }))
  return parquetPathsFromSiblings(siblings, input.split)
}

export async function readPinnedHfParquetRows(input: {
  repoId: string
  revision: string
  split: string
  token: string
  siblings?: readonly HfSibling[]
  fetchImpl?: typeof fetch
}): Promise<PinnedParquetRow[]> {
  const revision = clean(input.revision, 40).toLowerCase()
  const split = clean(input.split, 120)
  const token = clean(input.token, 4096)
  if (!HEX40.test(revision) || !/^[A-Za-z0-9_.-]+$/.test(split) || token.length < 20) {
    throw new Error('distilled_evaluation_hf_pinned_parquet_contract_invalid')
  }
  const fetchImpl = input.fetchImpl || fetch
  const paths = await listPinnedParquetPaths({
    repoId: input.repoId,
    revision,
    split,
    token,
    siblings: input.siblings,
    fetchImpl,
  })
  if (!paths.length) throw new Error('distilled_evaluation_hf_pinned_parquet_missing')
  if (paths.length > MAX_PARQUET_FILES) throw new Error('distilled_evaluation_hf_pinned_parquet_file_ceiling')

  const repo = encodeRepoId(input.repoId)
  const rows: PinnedParquetRow[] = []
  for (const path of paths) {
    const fileUrl = `https://huggingface.co/datasets/${repo}/resolve/${revision}/${encodeRepoPath(path)}`
    const response = await fetchImpl(fileUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`distilled_evaluation_hf_parquet_http_${response.status}`)
    const file = await readResponseBodyBounded(response, MAX_PARQUET_FILE_BYTES)

    const objects = await parquetReadObjects({ file })
    for (const raw of objects) {
      const row = raw as Record<string, unknown>
      const text = clean(row.text, 500_000)
      const itemHash = clean(row.item_hash, 64).toLowerCase()
      if (!text || !/^[a-f0-9]{64}$/.test(itemHash)) {
        throw new Error('distilled_evaluation_hf_pinned_parquet_row_invalid')
      }
      rows.push(Object.freeze({ text, item_hash: itemHash }))
      if (rows.length > MAX_ROWS) throw new Error('distilled_evaluation_hf_pinned_parquet_row_ceiling')
    }
  }
  return rows
}
