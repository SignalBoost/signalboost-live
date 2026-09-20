// saas/lib/ai/cos/hfPinnedDatasetRevision.ts
//
// Why this module exists.
//
// The mass evaluator validated a holdout pin by fetching `GET /api/datasets/{repo}` — which returns the
// dataset's CURRENT default-branch sha — and requiring it to equal the revision recorded in the artifact's
// holdout_data_ref, failing otherwise with `mass_distilled_evaluation_holdout_revision_moved`. That check is
// satisfied only while the pinned commit is still HEAD. Any later commit to that dataset repository makes
// every artifact pinned before it fail permanently and identically, on every retry, forever.
//
// The check was also not what protects the evaluation. Holdout integrity is enforced downstream and
// cryptographically: rows are read from `/resolve/{revision}/` (immutable, commit-addressed), every row's
// text is re-hashed against its item_hash, and the full observed item-hash set is compared to the pinned
// holdout manifest hash. Content cannot drift under those gates no matter where HEAD has moved.
//
// So this module replaces "is the pin still HEAD" with the question actually worth asking — "does the pinned
// commit still exist, and is it what the registry hands back" — by resolving the repository AT the pinned
// revision. That is strictly stronger than the old check (it proves the commit resolves, which HEAD equality
// only proved by accident) and it returns the file list belonging to that commit rather than to HEAD, so the
// parquet reader stops deriving paths from a tree it is not going to read.
//
// Error names are stable and deterministic by design: the rolling evaluation authority compares whole error
// strings, so an identical cause must keep producing an identical string and a different cause must produce
// a different one.

const HEX40 = /^[a-f0-9]{40}$/i
const REPO_PART = /^[A-Za-z0-9_.-]+$/
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_SIBLINGS = 20_000

export type PinnedHfDatasetSibling = Readonly<{ rfilename: string }>

export type PinnedHfDatasetRevision = Readonly<{
  repoId: string
  sha: string
  siblings: readonly PinnedHfDatasetSibling[]
}>

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').trim().slice(0, max)
}

function encodeRepoId(repoId: string): string {
  const parts = clean(repoId, 400).split('/')
  if (parts.length !== 2 || parts.some(part => !REPO_PART.test(part))) {
    throw new Error('hf_pinned_dataset_repo_invalid')
  }
  return parts.map(encodeURIComponent).join('/')
}

/**
 * Resolve a Hugging Face dataset repository at an exact commit.
 *
 * Throws:
 *  - hf_pinned_dataset_repo_invalid       malformed owner/name
 *  - hf_pinned_dataset_revision_invalid   revision is not a 40-hex commit sha
 *  - hf_pinned_dataset_token_missing      no usable HF token was supplied
 *  - hf_pinned_dataset_revision_missing   the commit does not resolve (404) — terminal for that artifact
 *  - hf_pinned_dataset_revision_http_<n>  any other non-OK response — retryable
 *  - hf_pinned_dataset_revision_mismatch  the registry returned a different commit than the one requested
 */
export async function resolvePinnedHfDatasetRevision(input: {
  repoId: string
  revision: string
  token: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<PinnedHfDatasetRevision> {
  const repoId = clean(input.repoId, 400)
  const revision = clean(input.revision, 40).toLowerCase()
  const token = clean(input.token, 4096)
  const repo = encodeRepoId(repoId)
  if (!HEX40.test(revision)) throw new Error('hf_pinned_dataset_revision_invalid')
  if (token.length < 20) throw new Error('hf_pinned_dataset_token_missing')

  const fetchImpl = input.fetchImpl || fetch
  const timeoutMs = Number.isFinite(input.timeoutMs) && Number(input.timeoutMs) > 0
    ? Math.min(60_000, Number(input.timeoutMs))
    : DEFAULT_TIMEOUT_MS

  const response = await fetchImpl(
    `https://huggingface.co/api/datasets/${repo}/revision/${encodeURIComponent(revision)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    },
  )

  // 404 is the only answer that means the pin itself is gone. Every other non-OK status is the registry
  // being unavailable or refusing us, which says nothing about the artifact.
  if (response.status === 404) throw new Error('hf_pinned_dataset_revision_missing')
  if (!response.ok) throw new Error(`hf_pinned_dataset_revision_http_${response.status}`)

  const payload: any = await response.json()
  const sha = clean(payload?.sha, 40).toLowerCase()
  if (sha !== revision) throw new Error('hf_pinned_dataset_revision_mismatch')

  const rawSiblings = Array.isArray(payload?.siblings) ? payload.siblings : []
  if (rawSiblings.length > MAX_SIBLINGS) throw new Error('hf_pinned_dataset_revision_sibling_ceiling')
  const siblings: PinnedHfDatasetSibling[] = []
  for (const item of rawSiblings) {
    const rfilename = clean((item as any)?.rfilename, 2000)
    if (rfilename) siblings.push(Object.freeze({ rfilename }))
  }

  return Object.freeze({ repoId, sha, siblings: Object.freeze(siblings) })
}
