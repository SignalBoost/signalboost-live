import type { BuilderFile } from './contracts.ts'

/**
 * Private, isolated GitHub publication of host-verified Builder files.
 * Callers must authorize the owning user and verify tests before invoking this
 * module. Do not accept repository names, visibility or credentials from model output.
 */
export type IsolatedPublication = Readonly<{
  repository: string
  pullRequestUrl: string
  pullRequestNumber: number
  commitSha: string
}>

const safeName = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,90}$/
const excluded = /(^|\/)(?:\.git|\.env(?:\..*)?|node_modules|\.next|\.vercel|secrets?|credentials?|private[-_.]?key)(?:\/|$)/i
const maxFiles = 100
const maxBytes = 2_000_000

export function validateIsolatedFiles(files: readonly BuilderFile[]): void {
  if (!files.length || files.length > maxFiles) throw new Error('builder_isolated_file_count_invalid')
  let bytes = 0
  const seen = new Set<string>()
  for (const file of files) {
    const path = String(file.path || '').replace(/\\/g, '/')
    if (!path || path.length > 240 || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..') || excluded.test(path)) {
      throw new Error('builder_isolated_path_rejected')
    }
    if (seen.has(path)) throw new Error('builder_isolated_duplicate_path')
    seen.add(path)
    bytes += Buffer.byteLength(file.content, 'utf8')
    if (bytes > maxBytes) throw new Error('builder_isolated_files_too_large')
  }
}

type Request = typeof fetch

export async function publishVerifiedIsolatedProject(input: Readonly<{
  owner: string
  repositoryName: string
  ownerType: 'user' | 'organization'
  token: string
  files: readonly BuilderFile[]
  verified: boolean
  authorized: boolean
  signal?: AbortSignal
  request?: Request
}>): Promise<IsolatedPublication> {
  if (!input.authorized || !input.verified) throw new Error('builder_isolated_publication_not_authorized')
  if (!safeName.test(input.owner) || !safeName.test(input.repositoryName) || !input.token) throw new Error('builder_isolated_destination_invalid')
  validateIsolatedFiles(input.files)
  const http = input.request ?? fetch
  const headers = {
    'Authorization': `Bearer ${input.token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'SignalBoost-Builder-V2',
  }
  const api = 'https://api.github.com'
  async function json(path: string, method = 'GET', body?: unknown): Promise<any> {
    if (input.signal?.aborted) throw new Error('builder_isolated_publication_cancelled')
    const response = await http(api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: input.signal })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(`builder_isolated_github_http_${response.status}`)
    return payload
  }

  // Private-by-default creation. Never publish source into the platform repository.
  const created = await json(input.ownerType === 'organization' ? `/orgs/${encodeURIComponent(input.owner)}/repos` : '/user/repos', 'POST', {
    name: input.repositoryName, private: true, auto_init: true,
    description: 'Isolated Builder V2 verified project',
  })
  if (created.full_name !== `${input.owner}/${input.repositoryName}` || created.private !== true) {
    throw new Error('builder_isolated_repository_identity_mismatch')
  }
  const encodedRepo = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repositoryName)}`
  const base = String(created.default_branch || 'main')
  if (!safeName.test(base)) throw new Error('builder_isolated_invalid_default_branch')
  const baseRef = await json(`${encodedRepo}/git/ref/heads/${encodeURIComponent(base)}`)
  const baseSha = String(baseRef.object?.sha || '')
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error('builder_isolated_invalid_base_sha')
  const baseCommit = await json(`${encodedRepo}/git/commits/${baseSha}`)
  const tree = []
  for (const file of input.files) {
    const blob = await json(`${encodedRepo}/git/blobs`, 'POST', { content: file.content, encoding: 'utf-8' })
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  const newTree = await json(`${encodedRepo}/git/trees`, 'POST', { base_tree: baseCommit.tree.sha, tree })
  const commit = await json(`${encodedRepo}/git/commits`, 'POST', {
    message: 'Builder V2: verified isolated project', tree: newTree.sha, parents: [baseSha],
  })
  const branch = 'builder/verified-repair'
  await json(`${encodedRepo}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: commit.sha })
  const pr = await json(`${encodedRepo}/pulls`, 'POST', {
    head: branch, base, title: 'Builder V2: verified project', body: 'Host tests passed before publication. Preview and deployment require separate independent verification.',
    draft: true,
  })
  if (!pr.html_url || !Number.isInteger(pr.number)) throw new Error('builder_isolated_pull_request_unconfirmed')
  return { repository: created.full_name, pullRequestUrl: pr.html_url, pullRequestNumber: pr.number, commitSha: commit.sha }
}
