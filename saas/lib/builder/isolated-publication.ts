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

export function wantsIsolatedPublication(objective: string): boolean {
  return /\b(?:create|build|make)\b[\s\S]{0,100}\b(?:isolated|new)\b/i.test(objective)
    && /\b(?:pull request|open\s+(?:a\s+)?pr|deploy[\s\S]{0,100}preview|publish\s+(?:the\s+)?repo)\b/i.test(objective)
}

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
  deadlineAt?: number
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
    if (input.signal?.aborted || (input.deadlineAt && Date.now() >= input.deadlineAt)) throw new Error('builder_isolated_publication_deadline_exceeded')
    const timeout = input.deadlineAt ? Math.max(1, input.deadlineAt - Date.now()) : 30_000
    const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
    const response = await http(api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal })
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
  // Keep the acceptance PR against an isolated test branch, not the repo's main.
  await json(`${encodedRepo}/git/refs`, 'POST', { ref: 'refs/heads/isolated-test', sha: baseSha })
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
    head: branch, base: 'isolated-test', title: 'Builder V2: verified project', body: 'Host tests passed before publication. Preview and deployment require separate independent verification.',
    draft: true,
  })
  if (!pr.html_url || !Number.isInteger(pr.number)) throw new Error('builder_isolated_pull_request_unconfirmed')
  return { repository: created.full_name, pullRequestUrl: pr.html_url, pullRequestNumber: pr.number, commitSha: commit.sha }
}


/** Owner-only preview of the exact GitHub commit. No arbitrary host supplied by model text. */
export async function verifyIsolatedPreview(input: Readonly<{
  token: string
  projectId: string
  repository: string
  commitSha: string
  files: readonly BuilderFile[]
  deadlineAt: number
  signal?: AbortSignal
  request?: typeof fetch
}>): Promise<Readonly<{ deploymentId: string; previewUrl: string; status: 'verified' }>> {
  if (!input.token || !/^prj_[a-zA-Z0-9_]+$/.test(input.projectId)) throw new Error('builder_isolated_vercel_configuration_invalid')
  if (!/^[0-9a-f]{40}$/i.test(input.commitSha)) throw new Error('builder_isolated_commit_invalid')
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input.repository)) throw new Error('builder_isolated_repository_invalid')
  validateIsolatedFiles(input.files)
  const http = input.request ?? fetch
  const headers = { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' }
  const bounded = async (url: string, init: RequestInit): Promise<any> => {
    if (Date.now() >= input.deadlineAt || input.signal?.aborted) throw new Error('builder_isolated_publication_deadline_exceeded')
    const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(Math.max(1, input.deadlineAt - Date.now()))]) : AbortSignal.timeout(Math.max(1, input.deadlineAt - Date.now()))
    const response = await http(url, { ...init, signal })
    if (!response.ok) throw new Error(`builder_isolated_vercel_http_${response.status}`)
    return response.json()
  }
  // Deploy the same verified file set sent to GitHub: newly created private repos
  // are not assumed to have a Vercel Git connection.
  const deployed = await bounded('https://api.vercel.com/v13/deployments', {
    method: 'POST', headers,
    body: JSON.stringify({
      name: 'builder-isolated-preview',
      project: input.projectId,
      target: 'preview',
      files: input.files.map(file => ({ file: file.path, data: file.content, encoding: 'utf-8' })),
      meta: { builderCommitSha: input.commitSha, builderRepository: input.repository },
    }),
  })
  const id = String(deployed?.id || deployed?.uid || '')
  if (!/^dpl_[a-zA-Z0-9]+$/.test(id)) throw new Error('builder_isolated_deployment_id_invalid')
  let ready = false
  let url = ''
  for (let attempt = 0; attempt < 20; attempt++) {
    const record = await bounded(`https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}`, { method: 'GET', headers })
    if (record.readyState === 'ERROR' || record.readyState === 'CANCELED') throw new Error('builder_isolated_deployment_failed')
    if (record.readyState === 'READY') {
      ready = true
      url = String(record.url || '')
      break
    }
    if (Date.now() + 1500 >= input.deadlineAt) break
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  if (!ready || !/^[a-zA-Z0-9.-]+\.vercel\.app$/.test(url)) throw new Error('builder_isolated_preview_not_ready')
  if (Date.now() >= input.deadlineAt || input.signal?.aborted) throw new Error('builder_isolated_publication_deadline_exceeded')
  const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(Math.max(1, input.deadlineAt - Date.now()))]) : AbortSignal.timeout(Math.max(1, input.deadlineAt - Date.now()))
  const response = await http(`https://${url}/`, { method: 'GET', redirect: 'manual', signal })
  if (response.status !== 200) throw new Error('builder_isolated_preview_smoke_failed')
  return { deploymentId: id, previewUrl: `https://${url}`, status: 'verified' }
}
