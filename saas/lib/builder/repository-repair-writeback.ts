import type { BuilderFile } from './contracts.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'

const GITHUB_API = 'https://api.github.com/repos/SignalBoost/signalboost-live'
const SAFE_SHA = /^[0-9a-f]{40}$/i
const SAFE_BRANCH = /^(?![-/])(?!.*(?:\.\.|\/\/))[A-Za-z0-9._/-]{1,180}$/
const MAX_WRITE_FILES = 30

type RequestLike = typeof fetch
type JsonRecord = Record<string, any>
type GitBlobMode = '100644' | '100755'
export type RepositoryRepairWritebackStage = 'not_started' | 'preflight' | 'objects_written' | 'branch_created' | 'pr_created'

export type RepositoryRepairWritebackResult = Readonly<{
  repositoryWriteAllowed: boolean
  repositoryWriteTaken: boolean
  stage: RepositoryRepairWritebackStage
  branch: string | null
  commitSha: string | null
  pullRequestNumber: number | null
  pullRequestUrl: string | null
  error: string | null
}>

function result(input: Partial<RepositoryRepairWritebackResult>): RepositoryRepairWritebackResult {
  return Object.freeze({
    repositoryWriteAllowed: false,
    repositoryWriteTaken: false,
    stage: 'not_started',
    branch: null,
    commitSha: null,
    pullRequestNumber: null,
    pullRequestUrl: null,
    error: null,
    ...input,
  })
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'SignalBoost-COS-Platform-Engineer',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function encodedBranch(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/')
}

function safeChangedPath(file: BuilderFile): string | null {
  const raw = String(file.path || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^saas\//, '')
  if (!raw || raw.startsWith('/') || raw.includes('..') || /(^|\/)(?:\.git|node_modules|\.next|dist|build|coverage|\.vercel)(?:\/|$)/.test(raw)) return null
  if (/(^|\/)(?:\.env(?:\.[^/]*)?|credentials?|secrets?|tokens?|private[-_.]?key|id_rsa|id_ed25519)(?:$|\/)|\.(?:pem|key|p12|pfx)$/i.test(raw)) return null
  return `saas/${raw}`
}

function repairBranch(baseSha: string, workspaceId: string): string {
  const suffix = String(workspaceId || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  return `cos/platform-repair-${baseSha.slice(0, 8)}-${suffix}`
}

async function requestJson(request: RequestLike, url: string, init: RequestInit, expected: readonly number[]): Promise<JsonRecord> {
  const response = await request(url, init)
  const payload = await response.json().catch(() => ({})) as JsonRecord
  if (!expected.includes(response.status)) {
    const detail = typeof payload?.message === 'string' ? payload.message.slice(0, 240) : `http_${response.status}`
    throw new Error(`builder_repository_writeback_${detail.replace(/\s+/g, '_').toLowerCase()}`)
  }
  return payload
}

async function executableModesForChangedFiles(
  request: RequestLike,
  baseTree: string,
  files: readonly { path: string }[],
  writeHeaders: Record<string, string>,
): Promise<Map<string, GitBlobMode>> {
  // Today the repository's tracked executable sources live under saas/scripts/. Avoid an extra
  // GitHub tree read for ordinary code repairs, but never rewrite a tracked script until its base
  // mode has been observed. New scripts default to non-executable unless the repository already
  // tracks that path as executable.
  const candidates = new Set(files.map(file => file.path).filter(path => path.startsWith('saas/scripts/')))
  if (!candidates.size) return new Map()

  const baseTreeListing = await requestJson(
    request,
    `${GITHUB_API}/git/trees/${baseTree}?recursive=1`,
    { method: 'GET', headers: writeHeaders },
    [200],
  )
  const modes = new Map<string, GitBlobMode>()
  const entries = Array.isArray(baseTreeListing?.tree) ? baseTreeListing.tree : []
  for (const entry of entries) {
    const path = String(entry?.path || '')
    const mode = String(entry?.mode || '')
    if (!candidates.has(path) || String(entry?.type || '') !== 'blob') continue
    if (mode === '100644' || mode === '100755') modes.set(path, mode)
  }
  return modes
}

/**
 * Publish an already-verified Platform Engineer repair as a review branch + GitHub PR.
 * This function never merges or deploys. The server-only write token is capability evidence;
 * caller/user text cannot supply or upgrade it.
 *
 * Partial mutations are reported honestly. If Git objects or a branch were created before a later
 * API call failed, repositoryWriteTaken remains true and the last completed stage is returned.
 */
export async function publishSignalBoostRepositoryRepair(input: {
  target: SignalBoostRepositoryRepairTarget
  workspaceId: string
  files: readonly BuilderFile[]
  patch: string
  request?: RequestLike
  token?: string
}): Promise<RepositoryRepairWritebackResult> {
  const token = String(input.token ?? process.env.GITHUB_WRITE_TOKEN ?? '').trim()
  if (!token) return result({ error: 'builder_repository_write_not_configured' })

  const request = input.request ?? fetch
  const baseSha = String(input.target.fullCommitSha || '').toLowerCase()
  const baseBranch = String(input.target.branch || '').trim()
  if (!SAFE_SHA.test(baseSha) || !SAFE_BRANCH.test(baseBranch)) {
    return result({ repositoryWriteAllowed: true, error: 'builder_repository_write_target_invalid' })
  }
  if (/(^|\n)deleted file mode\s|(^|\n)\+\+\+ \/dev\/null(?:\n|$)/m.test(String(input.patch || ''))) {
    return result({ repositoryWriteAllowed: true, error: 'builder_repository_write_deletion_not_supported' })
  }
  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > MAX_WRITE_FILES) {
    return result({ repositoryWriteAllowed: true, error: 'builder_repository_write_file_set_invalid' })
  }

  const paths = new Set<string>()
  const files: Array<{ path: string; content: string }> = []
  for (const file of input.files) {
    const path = safeChangedPath(file)
    const content = String(file.content ?? '')
    if (!path || paths.has(path) || content.includes('\0')) {
      return result({ repositoryWriteAllowed: true, error: 'builder_repository_write_file_invalid' })
    }
    paths.add(path)
    files.push({ path, content })
  }

  const writeHeaders = headers(token)
  let mutationTaken = false
  let stage: RepositoryRepairWritebackStage = 'not_started'
  let branch: string | null = null
  let commitSha: string | null = null

  try {
    // Re-verify freshness immediately before mutation. A repair generated against a superseded
    // branch head is never written, even if the earlier enqueue preflight was current.
    const branchRef = await requestJson(
      request,
      `${GITHUB_API}/git/ref/heads/${encodedBranch(baseBranch)}`,
      { method: 'GET', headers: writeHeaders },
      [200],
    )
    const currentHead = String(branchRef?.object?.sha || '').toLowerCase()
    stage = 'preflight'
    if (!SAFE_SHA.test(currentHead) || currentHead !== baseSha) {
      return result({ repositoryWriteAllowed: true, stage, error: 'builder_repository_write_target_superseded' })
    }

    const baseCommit = await requestJson(
      request,
      `${GITHUB_API}/git/commits/${baseSha}`,
      { method: 'GET', headers: writeHeaders },
      [200],
    )
    const baseTree = String(baseCommit?.tree?.sha || '')
    if (!SAFE_SHA.test(baseTree)) throw new Error('builder_repository_writeback_base_tree_invalid')
    const executableModes = await executableModesForChangedFiles(request, baseTree, files, writeHeaders)

    const tree: Array<{ path: string; mode: GitBlobMode; type: 'blob'; sha: string }> = []
    for (const file of files) {
      const blob = await requestJson(
        request,
        `${GITHUB_API}/git/blobs`,
        { method: 'POST', headers: writeHeaders, body: JSON.stringify({ content: file.content, encoding: 'utf-8' }) },
        [201],
      )
      mutationTaken = true
      stage = 'objects_written'
      const blobSha = String(blob?.sha || '')
      if (!SAFE_SHA.test(blobSha)) throw new Error('builder_repository_writeback_blob_invalid')
      tree.push({ path: file.path, mode: executableModes.get(file.path) || '100644', type: 'blob', sha: blobSha })
    }

    branch = repairBranch(baseSha, input.workspaceId)
    if (baseBranch === 'main') {
      const tokenContent = [
        '# SignalBoost main integration serialization token',
        '# Every pull request targeting main must replace BOTH values below.',
        '# This shared-file write intentionally makes concurrent PRs conflict after one merges.',
        `base_sha=${baseSha}`,
        `branch=${branch}`,
        '',
      ].join('\n')
      const tokenBlob = await requestJson(
        request,
        `${GITHUB_API}/git/blobs`,
        { method: 'POST', headers: writeHeaders, body: JSON.stringify({ content: tokenContent, encoding: 'utf-8' }) },
        [201],
      )
      mutationTaken = true
      stage = 'objects_written'
      const tokenBlobSha = String(tokenBlob?.sha || '')
      if (!SAFE_SHA.test(tokenBlobSha)) throw new Error('builder_repository_writeback_token_blob_invalid')
      tree.push({ path: '.github/main-write-token', mode: '100644', type: 'blob', sha: tokenBlobSha })
    }

    const createdTree = await requestJson(
      request,
      `${GITHUB_API}/git/trees`,
      { method: 'POST', headers: writeHeaders, body: JSON.stringify({ base_tree: baseTree, tree }) },
      [201],
    )
    mutationTaken = true
    stage = 'objects_written'
    const treeSha = String(createdTree?.sha || '')
    if (!SAFE_SHA.test(treeSha)) throw new Error('builder_repository_writeback_tree_invalid')

    const createdCommit = await requestJson(
      request,
      `${GITHUB_API}/git/commits`,
      {
        method: 'POST',
        headers: writeHeaders,
        body: JSON.stringify({
          message: 'COS Platform Engineer: verified repository repair',
          tree: treeSha,
          parents: [baseSha],
        }),
      },
      [201],
    )
    mutationTaken = true
    stage = 'objects_written'
    commitSha = String(createdCommit?.sha || '')
    if (!SAFE_SHA.test(commitSha)) throw new Error('builder_repository_writeback_commit_invalid')

    await requestJson(
      request,
      `${GITHUB_API}/git/refs`,
      { method: 'POST', headers: writeHeaders, body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha }) },
      [201],
    )
    mutationTaken = true
    stage = 'branch_created'

    const pull = await requestJson(
      request,
      `${GITHUB_API}/pulls`,
      {
        method: 'POST',
        headers: writeHeaders,
        body: JSON.stringify({
          title: 'COS Platform Engineer: verified repository repair',
          head: branch,
          base: baseBranch,
          body: [
            'Owner-authorized Platform Engineer repair.',
            '',
            `Pinned base: \`${baseSha}\``,
            `Changed files: ${files.length}`,
            '',
            'The repair was generated and proved in the network-denied repository sandbox.',
            'This PR is intentionally not self-merged or deployed by the agent.',
          ].join('\n'),
          maintainer_can_modify: true,
        }),
      },
      [201],
    )
    mutationTaken = true
    stage = 'pr_created'
    const pullRequestNumber = Number(pull?.number)
    const pullRequestUrl = typeof pull?.html_url === 'string' ? pull.html_url : ''
    if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1 || !/^https:\/\/github\.com\//i.test(pullRequestUrl)) {
      throw new Error('builder_repository_writeback_pr_invalid')
    }

    return result({
      repositoryWriteAllowed: true,
      repositoryWriteTaken: true,
      stage,
      branch,
      commitSha,
      pullRequestNumber,
      pullRequestUrl,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_repository_writeback_failed'
    return result({
      repositoryWriteAllowed: true,
      repositoryWriteTaken: mutationTaken,
      stage,
      branch: stage === 'branch_created' || stage === 'pr_created' ? branch : null,
      commitSha,
      error: message.startsWith('builder_repository_') ? message : 'builder_repository_writeback_failed',
    })
  }
}
