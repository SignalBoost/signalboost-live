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

/**
 * Adapt a host-verified Node HTTP server to Vercel Functions without modifying its source.
 * The adapter is deterministic, published to GitHub and deployed with the same content.
 */
export function isolatedDeploymentFiles(files: readonly BuilderFile[]): BuilderFile[] {
  validateIsolatedFiles(files)
  const entry = files.find(file => file.path === 'index.js')?.content || ''
  if (!/module\.exports\s*=\s*server\s*;?/.test(entry) || !/createServer\s*\(/.test(entry)) return [...files]
  if (files.some(file => file.path === 'api/index.js' || file.path === 'vercel.json')) {
    throw new Error('builder_isolated_adapter_path_conflict')
  }
  const updatedAt = files.find(file => file.path === 'index.js')?.updatedAt ?? Date.now()
  const adapted = [
    ...files,
    { path: 'api/index.js', updatedAt, content: "const server = require('../index.js')\nmodule.exports = (req, res) => server.emit('request', req, res)\n" },
    { path: 'vercel.json', updatedAt, content: JSON.stringify({ version: 2, rewrites: [{ source: '/(.*)', destination: '/api/index' }] }) + '\n' },
  ]
  validateIsolatedFiles(adapted)
  return adapted
}

/** Only relative same-origin GET paths and literal JSON response fixtures are accepted. */
export function isolatedPreviewProbe(objective: string): { path: string; expected: unknown | null } {
  const endpoint = /\bGET\s+(\/[^\s`<>"']+)/i.exec(objective)
  if (!endpoint) return { path: '/', expected: null }
  const path = endpoint[1]
  if (!/^\/[A-Za-z0-9_~%?&=.+-]+$/.test(path) || path.startsWith('//')) {
    throw new Error('builder_isolated_preview_path_invalid')
  }
  const fixture = /expected\s+response\s*:\s*```(?:json)?\s*([\s\S]*?)```/i.exec(objective)
  if (!fixture) throw new Error('builder_isolated_preview_expected_response_missing')
  let expected: unknown
  try { expected = JSON.parse(fixture[1]) }
  catch { throw new Error('builder_isolated_preview_expected_json_invalid') }
  return { path, expected }
}

type Request = typeof fetch

/**
 * Every verified job publishes into one pre-created private repository, never a new one per job: the credential then
 * needs Contents + Pull requests on that single repository only, and no repository-creation authority anywhere.
 * Production 2026-10-21: per-job creation was refused (HTTP 403) by a token scoped to existing repositories.
 * Each job's files live under their own folder, so jobs never overwrite or conflict with one another on the default branch.
 */
export const ISOLATED_REPOSITORY_NAME = 'builder-isolated'
const jobKeyPattern = /^[a-z0-9][a-z0-9-]{7,63}$/i

export function isolatedProjectFolder(jobKey: string): string {
  if (!jobKeyPattern.test(jobKey)) throw new Error('builder_isolated_destination_invalid')
  return `projects/${jobKey}`
}

type GitHubCall = Readonly<{ token: string; signal?: AbortSignal; deadlineAt?: number; request?: Request }>

async function github(call: GitHubCall, path: string, method = 'GET', body?: unknown, stage = 'request'): Promise<any> {
  if (call.signal?.aborted || (call.deadlineAt && Date.now() >= call.deadlineAt)) throw new Error('builder_isolated_publication_deadline_exceeded')
  const timeout = call.deadlineAt ? Math.max(1, call.deadlineAt - Date.now()) : 30_000
  const signal = call.signal ? AbortSignal.any([call.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
  const response = await (call.request ?? fetch)('https://api.github.com' + path, {
    method,
    headers: {
      'Authorization': `Bearer ${call.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'SignalBoost-Builder-V2',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    // Never expose GitHub's response body or authentication details to job history.
    throw new Error(`builder_isolated_github_${stage}_http_${response.status}`)
  }
  return payload
}

const repositoryPath = (fullName: string) => `/repos/${fullName.split('/').map(encodeURIComponent).join('/')}`

/**
 * Create the job's own private repository under the configured owner. GitHub has two endpoints: an organization's
 * repositories are created under /orgs/{owner}, a personal account's under /user (the token's own account).
 * Production 2026-10-21: SignalBoost is a personal account, so /orgs/SignalBoost/repos answered 404.
 */
async function createPrivateRepository(call: GitHubCall & { owner: string }, repositoryName: string): Promise<void> {
  const owner = await github(call, `/users/${encodeURIComponent(call.owner)}`, 'GET', undefined, 'owner_lookup')
  const ownerName = String(owner.login || '')
  if (ownerName.toLowerCase() !== call.owner.toLowerCase()) throw new Error('builder_isolated_owner_identity_mismatch')
  const path = owner.type === 'Organization' ? `/orgs/${encodeURIComponent(ownerName)}/repos`
    : owner.type === 'User' ? '/user/repos'
      : null
  if (!path) throw new Error('builder_isolated_owner_type_unsupported')
  let created: any
  try {
    created = await github(call, path, 'POST', {
      name: repositoryName, private: true, auto_init: true,
      description: 'Isolated Builder V2 verified project',
    }, 'create_repository')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // 403/404: the credential may not create repositories for this owner. Never fall back to the shared repository.
    if (/_create_repository_http_(?:403|404)$/.test(message)) throw new Error(`builder_isolated_repository_creation_not_permitted_${message.slice(-3)}`)
    throw error
  }
  if (created.private !== true || String(created.full_name || '').toLowerCase() !== `${ownerName}/${repositoryName}`.toLowerCase()) {
    // A personal-account token belonging to someone else creates the repository under that other account.
    throw new Error('builder_isolated_created_repository_invalid')
  }
}

/**
 * A repository GitHub has just created is not readable at once: its lookup and its first commit trail the creation
 * by a moment. Production 2026-10-21: builder-0c95a720… was created private under SignalBoost, and the lookup one
 * request later answered 404. Only a just-created repository is waited for, briefly and within the job deadline.
 */
async function untilCreated<T>(call: GitHubCall, justCreated: boolean, pending: RegExp, read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (!justCreated || !pending.test(message) || attempt >= 10 || (call.deadlineAt && Date.now() + 1000 >= call.deadlineAt)) throw error
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

async function lookupRepository(call: GitHubCall & { owner: string; newRepository?: boolean }, repositoryName: string): Promise<any> {
  return untilCreated(call, call.newRepository === true, /_repository_lookup_http_404$/,
    () => github(call, `/repos/${encodeURIComponent(call.owner)}/${repositoryName}`, 'GET', undefined, 'repository_lookup'))
    .catch((error: Error) => {
      if (error.message !== 'builder_isolated_github_repository_lookup_http_404') throw error
      // A missing repository and a token without access to it answer the same 404. A just-created one still
      // unreadable after the wait means the token cannot read it (limited to selected repositories).
      throw new Error(call.newRepository ? 'builder_isolated_created_repository_not_accessible' : 'builder_isolated_repository_unavailable')
    })
}

async function defaultBranchRef(call: GitHubCall, encodedRepo: string, branch: string, justCreated: boolean): Promise<any> {
  return untilCreated(call, justCreated, /_default_branch_ref_http_(?:404|409)$/,
    () => github(call, `${encodedRepo}/git/ref/heads/${encodeURIComponent(branch)}`, 'GET', undefined, 'default_branch_ref'))
    .catch((error: Error) => {
      // GitHub answers 409 for a repository with no commits (created without a README).
      throw new Error(error.message === 'builder_isolated_github_default_branch_ref_http_409' ? 'builder_isolated_repository_empty' : error.message)
    })
}

export async function publishVerifiedIsolatedProject(input: Readonly<{
  owner: string
  jobKey: string
  token: string
  files: readonly BuilderFile[]
  verified: boolean
  authorized: boolean
  signal?: AbortSignal
  deadlineAt?: number
  request?: Request
  newRepository?: boolean
}>): Promise<IsolatedPublication> {
  if (!input.authorized || !input.verified) throw new Error('builder_isolated_publication_not_authorized')
  if (!safeName.test(input.owner) || !jobKeyPattern.test(input.jobKey) || !input.token) throw new Error('builder_isolated_destination_invalid')
  validateIsolatedFiles(input.files)
  const json = (path: string, method = 'GET', body?: unknown, stage = 'request') => github(input, path, method, body, stage)

  // Explicit acceptance requiring a new private repository must never silently use the shared repository.
  const repositoryName = input.newRepository ? `builder-${input.jobKey}` : ISOLATED_REPOSITORY_NAME
  if (input.newRepository) await createPrivateRepository(input, repositoryName)
  const repository = await lookupRepository(input, repositoryName)
  const fullName = String(repository.full_name || '')
  if (fullName.toLowerCase() !== `${input.owner}/${repositoryName}`.toLowerCase()) throw new Error('builder_isolated_repository_identity_mismatch')
  // Never publish source into a public repository.
  if (repository.private !== true) throw new Error('builder_isolated_repository_not_private')
  const encodedRepo = repositoryPath(fullName)
  const defaultBranch = String(repository.default_branch || '')
  if (!safeName.test(defaultBranch)) throw new Error('builder_isolated_invalid_default_branch')
  const baseRef = await defaultBranchRef(input, encodedRepo, defaultBranch, input.newRepository === true)
  const baseSha = String(baseRef.object?.sha || '')
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error('builder_isolated_invalid_base_sha')
  const baseCommit = await json(`${encodedRepo}/git/commits/${baseSha}`, 'GET', undefined, 'base_commit')
  // A dedicated repository holds only this job, at its root; the shared one keeps each job in its own folder.
  const folder = input.newRepository ? '' : isolatedProjectFolder(input.jobKey)
  const headBranch = `builder/${input.jobKey}/verified`
  const tree = []
  for (const file of input.files) {
    const blob = await json(`${encodedRepo}/git/blobs`, 'POST', { content: file.content, encoding: 'utf-8' }, 'create_blob')
    tree.push({ path: folder ? `${folder}/${file.path}` : file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }
  const newTree = await json(`${encodedRepo}/git/trees`, 'POST', { base_tree: baseCommit.tree.sha, tree }, 'create_tree')
  const commit = await json(`${encodedRepo}/git/commits`, 'POST', {
    message: `Builder V2: verified project ${input.jobKey}`, tree: newTree.sha, parents: [baseSha],
  }, 'create_commit')
  await json(`${encodedRepo}/git/refs`, 'POST', { ref: `refs/heads/${headBranch}`, sha: commit.sha }, 'create_head_branch')
  // A draft until the preview answers the requested endpoint; only then is it marked ready and merged.
  const pr = await json(`${encodedRepo}/pulls`, 'POST', {
    head: headBranch, base: defaultBranch, title: `Builder V2: verified project ${input.jobKey}`,
    body: `Host tests passed before publication. Files: \`${folder || '.'}/\`. Builder merges this pull request only after its Vercel preview answers the requested endpoint.`,
    draft: true,
  }, 'create_pull_request')
  if (!pr.html_url || !Number.isInteger(pr.number)) throw new Error('builder_isolated_pull_request_unconfirmed')
  return { repository: fullName, pullRequestUrl: pr.html_url, pullRequestNumber: pr.number, commitSha: commit.sha }
}

/**
 * Owner jobs end merged: after the preview of the exact commit is verified, the draft PR is marked ready and merged
 * into the repository's default branch, pinned to that commit. The merge is reported only once GitHub confirms it.
 */
export async function mergeVerifiedIsolatedPullRequest(input: Readonly<{
  token: string
  repository: string
  pullRequestNumber: number
  commitSha: string
  previewVerified: boolean
  signal?: AbortSignal
  deadlineAt?: number
  request?: Request
}>): Promise<Readonly<{ mergedInto: string; mergeCommitSha: string }>> {
  if (!input.previewVerified) throw new Error('builder_isolated_merge_requires_verified_preview')
  if (!input.token || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input.repository)) throw new Error('builder_isolated_repository_invalid')
  if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber < 1) throw new Error('builder_isolated_pull_request_invalid')
  if (!/^[0-9a-f]{40}$/i.test(input.commitSha)) throw new Error('builder_isolated_commit_invalid')
  const encodedRepo = repositoryPath(input.repository)
  const pull = await github(input, `${encodedRepo}/pulls/${input.pullRequestNumber}`, 'GET', undefined, 'pull_request_lookup')
  const repository = await github(input, encodedRepo, 'GET', undefined, 'repository_lookup')
  const defaultBranch = String(repository.default_branch || '')
  // Merge only the commit that was tested and previewed, only into the default branch.
  if (String(pull.head?.sha || '').toLowerCase() !== input.commitSha.toLowerCase()) throw new Error('builder_isolated_merge_head_changed')
  if (!safeName.test(defaultBranch) || pull.base?.ref !== defaultBranch) throw new Error('builder_isolated_merge_base_invalid')
  if (pull.draft === true) {
    const ready = await github(input, '/graphql', 'POST', {
      query: 'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }',
      variables: { id: String(pull.node_id || '') },
    }, 'mark_ready')
    if (ready?.errors?.length || ready?.data?.markPullRequestReadyForReview?.pullRequest?.isDraft !== false) {
      throw new Error('builder_isolated_github_mark_ready_refused')
    }
  }
  await github(input, `${encodedRepo}/pulls/${input.pullRequestNumber}/merge`, 'PUT', {
    sha: input.commitSha, merge_method: 'merge',
    commit_title: `Merge Builder V2 verified project (#${input.pullRequestNumber})`,
  }, 'merge')
  const merged = await github(input, `${encodedRepo}/pulls/${input.pullRequestNumber}`, 'GET', undefined, 'merge_confirmation')
  const mergeCommitSha = String(merged.merge_commit_sha || '')
  if (merged.merged !== true || !/^[0-9a-f]{40}$/i.test(mergeCommitSha)) throw new Error('builder_isolated_merge_unconfirmed')
  return { mergedInto: defaultBranch, mergeCommitSha }
}


/** Owner-only preview of the exact GitHub commit. No arbitrary host supplied by model text. */
export async function verifyIsolatedPreview(input: Readonly<{
  token: string
  projectId: string
  repository: string
  commitSha: string
  files: readonly BuilderFile[]
  objective?: string
  deadlineAt: number
  signal?: AbortSignal
  request?: typeof fetch
}>): Promise<Readonly<{ deploymentId: string; previewUrl: string; status: 'verified'; endpointUrl: string; httpStatus: number; responseBody?: unknown }>> {
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
    if (!response.ok) {
      const error = await response.json().catch(() => null)
      const rawCode = typeof error?.error?.code === 'string' ? error.error.code : ''
      const code = /^[a-z0-9_]{1,64}$/i.test(rawCode) ? rawCode.toLowerCase() : 'unknown'
      // Report the Vercel error code, but not untrusted response text or credentials.
      throw new Error(`builder_isolated_vercel_http_${response.status}_${code}`)
    }
    return response.json()
  }
  // Deploy the same verified file set sent to GitHub: newly created private repos
  // are not assumed to have a Vercel Git connection.
  const deployed = await bounded('https://api.vercel.com/v13/deployments', {
    method: 'POST', headers,
    body: JSON.stringify({
      name: 'builder-isolated-preview',
      project: input.projectId,
      // Vercel Preview is the default when target is omitted.
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
  const probe = isolatedPreviewProbe(input.objective || '')
  const response = await http(`https://${url}${probe.path}`, { method: 'GET', redirect: 'manual', signal })
  if (response.status !== 200) throw new Error('builder_isolated_preview_endpoint_status_invalid')
  let confirmedBody: unknown = undefined
  if (probe.expected !== null) {
    let actual: unknown
    try { actual = await response.json() }
    catch { throw new Error('builder_isolated_preview_endpoint_json_invalid') }
    if (JSON.stringify(actual) !== JSON.stringify(probe.expected)) throw new Error('builder_isolated_preview_endpoint_response_mismatch')
    confirmedBody = actual
  }
  return { deploymentId: id, previewUrl: `https://${url}`, status: 'verified',
    endpointUrl: `https://${url}${probe.path}`, httpStatus: response.status,
    ...(confirmedBody === undefined ? {} : { responseBody: confirmedBody }) }
}
