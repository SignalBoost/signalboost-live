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
  async function json(path: string, method = 'GET', body?: unknown, stage = 'request'): Promise<any> {
    if (input.signal?.aborted || (input.deadlineAt && Date.now() >= input.deadlineAt)) throw new Error('builder_isolated_publication_deadline_exceeded')
    const timeout = input.deadlineAt ? Math.max(1, input.deadlineAt - Date.now()) : 30_000
    const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
    const response = await http(api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      // Never expose GitHub's response body or authentication details to job history.
      throw new Error(`builder_isolated_github_${stage}_http_${response.status}`)
    }
    return payload
  }

  // The account type is read from GitHub, never configured by hand: an organization endpoint for a personal account
  // (or the reverse) answers 404. Production 2026-10-21: SignalBoost is a personal account.
  const account = await json(`/users/${encodeURIComponent(input.owner)}`, 'GET', undefined, 'owner_lookup')
  const owner = String(account.login || '')
  if (owner.toLowerCase() !== input.owner.toLowerCase() || !safeName.test(owner)) throw new Error('builder_isolated_destination_invalid')
  const organization = account.type === 'Organization'
  if (!organization) {
    // A personal-account repository is always created under the token's own account: refuse before creating it elsewhere.
    const viewer = await json('/user', 'GET', undefined, 'token_account')
    if (String(viewer.login || '').toLowerCase() !== owner.toLowerCase()) throw new Error('builder_isolated_token_account_mismatch')
  }

  // Scoped-token lane: an existing private repository needs Contents and Pull requests write,
  // not the account-wide permission required by POST /user/repos.
  const existing = input.existingRepository?.trim()
  if (existing && (existing.toLowerCase() === 'signalboost/signalboost-live' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(existing) ||
    existing.split('/')[0].toLowerCase() !== owner.toLowerCase())) {
    throw new Error('builder_isolated_existing_repository_invalid')
  }
  const repoName = existing ? existing.split('/')[1] : input.repositoryName
  const encodedRepo = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`
  const created = existing
    ? await json(encodedRepo, 'GET', undefined, 'existing_repository_lookup')
    : await json(organization ? `/orgs/${encodeURIComponent(owner)}/repos` : '/user/repos', 'POST', {
      name: input.repositoryName, private: true, auto_init: true,
      description: 'Isolated Builder V2 verified project',
    }, 'create_repository')
  if (String(created.full_name).toLowerCase() !== `${owner}/${repoName}`.toLowerCase() || created.private !== true) {
    throw new Error('builder_isolated_repository_identity_mismatch')
  }
  const base = String(created.default_branch || 'main')
  if (!safeName.test(base)) throw new Error('builder_isolated_invalid_default_branch')
  let baseRef: any
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      baseRef = await json(`${encodedRepo}/git/ref/heads/${encodeURIComponent(base)}`, 'GET', undefined, 'default_branch_ref')
      break
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'builder_isolated_github_default_branch_ref_http_404' || attempt === 4) throw error
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  const baseSha = String(baseRef.object?.sha || '')
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error('builder_isolated_invalid_base_sha')
  const baseCommit = await json(`${encodedRepo}/git/commits/${baseSha}`)
  // Keep the acceptance PR against an isolated test branch, not the repo's main.
  if (!existing) await json(`${encodedRepo}/git/refs`, 'POST', { ref: 'refs/heads/isolated-test', sha: baseSha })
  const tree = []
  for (const file of input.files) {
    const blob = await json(`${encodedRepo}/git/blobs`, 'POST', { content: file.content, encoding: 'utf-8' })
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  const newTree = await json(`${encodedRepo}/git/trees`, 'POST', { base_tree: baseCommit.tree.sha, tree })
  const commit = await json(`${encodedRepo}/git/commits`, 'POST', {
    message: 'Builder V2: verified isolated project', tree: newTree.sha, parents: [baseSha],
  })
  const branch = existing ? `builder/verified-${input.repositoryName}` : 'builder/verified-repair'
  await json(`${encodedRepo}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: commit.sha })
  const pr = await json(`${encodedRepo}/pulls`, 'POST', {
    head: branch, base: existing ? base : 'isolated-test', title: 'Builder V2: verified project', body: 'Host tests passed before publication. Preview and deployment require separate independent verification.',
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
