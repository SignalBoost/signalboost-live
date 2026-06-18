// saas/console-core/executors/github.ts
//
// GitHub provider migrated to the engine (Phase 3). Each action is a self-contained
// ActionExecutor that faithfully replicates the legacy executeGitHubAction logic —
// same endpoints, same return shapes — so pickers and UI behave identically.
// The legacy /api/hub/action GitHub branch stays in place until this is verified.
//
// Importing this module registers all GitHub executors as a side effect.

import { registerExecutor } from '../defaultHost'
import type { ActionField, ActionSchema } from '../types'

const API = 'https://api.github.com'

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** Resolve token + owner/name (env fallbacks), mirroring the legacy handler. */
function gh(input: Record<string, unknown>):
  | { ok: true; token: string; headers: Record<string, string>; owner: string; name: string }
  | { ok: false; error: string } {
  const token = process.env.GITHUB_WRITE_TOKEN
  if (!token) return { ok: false, error: 'GitHub not configured — set GITHUB_WRITE_TOKEN' }
  const raw = String(input.repo || '').trim()
  // Portable defaults: no hardcoded repository. A host may set
  // GITHUB_DEFAULT_OWNER / GITHUB_DEFAULT_REPO to provide a fallback; otherwise
  // owner/name come solely from the selected "owner/name" input, so the engine
  // never silently targets another tenant's repo.
  let owner = String(process.env.GITHUB_DEFAULT_OWNER || '').trim()
  let name = raw || String(process.env.GITHUB_DEFAULT_REPO || '').trim()
  if (raw.includes('/')) {
    const parts = raw.split('/')
    owner = (parts[0] || '').trim() || owner
    name = (parts[1] || '').trim()
  }
  return { ok: true, token, headers: ghHeaders(token), owner, name }
}

const errFrom = async (res: Response) =>
  `GitHub error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`

// ---- declarative field builders (mirror the live templates) ----
const REPO: ActionField = { id: 'repo', label: 'Repository', type: 'remote_select', required: true, remoteSource: { action: 'github.list_repos', dataPath: 'repos', valueKey: 'name', labelTemplate: '{name}' } }
const PR_NUM: ActionField = { id: 'number', label: 'Pull Request', type: 'remote_select', required: true, remoteSource: { action: 'github.list_prs', dataPath: 'pulls', valueKey: 'number', labelTemplate: '#{number} — {title} ({branch})', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } }
const ISSUE_NUM: ActionField = { id: 'number', label: 'Issue', type: 'remote_select', required: true, remoteSource: { action: 'github.list_issues', dataPath: 'issues', valueKey: 'number', labelTemplate: '#{number} — {title}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } }
const BRANCH: ActionField = { id: 'branch', label: 'Branch', type: 'remote_select', required: true, remoteSource: { action: 'github.list_branches', dataPath: 'branches', valueKey: 'name', labelTemplate: '{name}', dependsOn: ['repo'], emptyHint: 'Pick a repository first' } }

const schema = (id: string, label: string, verb: string, fields: ActionField[]): ActionSchema => ({ id, label, verb, fields })

// ---- READS ----
registerExecutor({
  providerId: 'github', actionId: 'list_repos', policyActionId: 'read_provider_status',
  schema: schema('github.list_repos', 'View Repos', 'view', []),
  async run() {
    const c = gh({}); if (!c.ok) return c
    const res = await fetch(`${API}/user/repos?per_page=50&sort=updated`, { headers: c.headers })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json(); const repos = Array.isArray(data) ? data : []
    return { ok: true, message: `${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} accessible`,
      data: { count: repos.length, repos: repos.slice(0, 25).map((r: any) => ({ name: r.full_name, private: r.private, updated_at: r.updated_at })) } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'list_prs', policyActionId: 'read_provider_status',
  schema: schema('github.list_prs', 'List Pull Requests', 'view', [REPO]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/pulls?state=open&per_page=30&sort=updated&direction=desc`, { headers: c.headers })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json(); const prs = Array.isArray(data) ? data : []
    return { ok: true, message: `${prs.length} open PR${prs.length === 1 ? '' : 's'}`,
      data: { count: prs.length, pulls: prs.slice(0, 30).map((p: any) => ({ number: p.number, title: p.title, branch: p.head?.ref, url: p.html_url })) } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'view_pr_files', policyActionId: 'read_provider_status',
  schema: schema('github.view_pr_files', 'View PR Files', 'view', [REPO, PR_NUM]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const number = String(input.number || ''); if (!number) return { ok: false, error: 'PR number is required' }
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/pulls/${encodeURIComponent(number)}/files?per_page=100`, { headers: c.headers })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json(); const files = Array.isArray(data) ? data : []
    return { ok: true, message: `PR #${number}: ${files.length} file${files.length === 1 ? '' : 's'} changed`,
      data: { count: files.length, files: files.slice(0, 100).map((f: any) => ({ file: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })) } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'list_branches', policyActionId: 'read_provider_status',
  schema: schema('github.list_branches', 'List Branches', 'view', [REPO]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/branches?per_page=100`, { headers: c.headers })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json(); const branches = Array.isArray(data) ? data : []
    return { ok: true, message: `${branches.length} branch${branches.length === 1 ? '' : 'es'}`,
      data: { count: branches.length, branches: branches.slice(0, 100).map((b: any) => ({ name: b.name, protected: b.protected })) } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'list_commits', policyActionId: 'read_provider_status',
  schema: schema('github.list_commits', 'Recent Commits', 'view', [REPO]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/commits?per_page=20`, { headers: c.headers })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json(); const commits = Array.isArray(data) ? data : []
    return { ok: true, message: `${commits.length} recent commit${commits.length === 1 ? '' : 's'}`,
      data: { count: commits.length, commits: commits.slice(0, 20).map((cm: any) => ({ sha: String(cm.sha || '').slice(0, 7), message: String(cm.commit?.message || '').split('\n')[0].slice(0, 100), author: cm.commit?.author?.name, date: cm.commit?.author?.date })) } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'list_issues', policyActionId: 'read_provider_status',
  schema: schema('github.list_issues', 'List Issues', 'view', [REPO]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/issues?state=open&per_page=30`, { headers: c.headers })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json(); const issues = (Array.isArray(data) ? data : []).filter((i: any) => !i.pull_request)
    return { ok: true, message: `${issues.length} open issue${issues.length === 1 ? '' : 's'}`,
      data: { count: issues.length, issues: issues.slice(0, 30).map((i: any) => ({ number: i.number, title: i.title, url: i.html_url })) } }
  },
})

// ---- WRITES ----
registerExecutor({
  providerId: 'github', actionId: 'open_issue', policyActionId: 'crud_actions',
  schema: schema('github.open_issue', 'Open Issue', 'create', [REPO, { id: 'title', label: 'Title', type: 'text', required: true }, { id: 'body', label: 'Description', type: 'text' }]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const title = String(input.title || ''); if (!title) return { ok: false, error: 'Issue title is required' }
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/issues`, { method: 'POST', headers: { ...c.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body: String(input.body || '') }) })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json()
    return { ok: true, message: `Issue opened: #${data.number}`, data: { number: data.number, url: data.html_url } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'edit_issue', policyActionId: 'crud_actions',
  schema: schema('github.edit_issue', 'Edit Issue', 'edit', [REPO, ISSUE_NUM, { id: 'title', label: 'New Title', type: 'text' }, { id: 'state', label: 'State', type: 'select', options: [{ label: 'Open', value: 'open' }, { label: 'Closed', value: 'closed' }] }]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const number = String(input.number || ''); if (!number) return { ok: false, error: 'Issue number is required' }
    const patch: Record<string, unknown> = {}
    if (input.title) patch.title = String(input.title)
    if (input.state) patch.state = String(input.state)
    if (Object.keys(patch).length === 0) return { ok: false, error: 'Provide a new title or state' }
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/issues/${encodeURIComponent(number)}`, { method: 'PATCH', headers: { ...c.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json()
    return { ok: true, message: `Issue #${data.number} updated (${data.state})`, data: { number: data.number, state: data.state, url: data.html_url } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'close_issue', policyActionId: 'crud_actions',
  schema: schema('github.close_issue', 'Close Issue', 'archive', [REPO, ISSUE_NUM]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const number = String(input.number || ''); if (!number) return { ok: false, error: 'Issue number is required' }
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/issues/${encodeURIComponent(number)}`, { method: 'PATCH', headers: { ...c.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed' }) })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json()
    return { ok: true, message: `Issue #${number} closed`, data: { number: data.number, state: data.state } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'merge_pr', policyActionId: 'crud_actions',
  schema: schema('github.merge_pr', 'Merge PR', 'edit', [REPO, PR_NUM, { id: 'method', label: 'Merge Method', type: 'select', options: [{ label: 'Merge commit', value: 'merge' }, { label: 'Squash', value: 'squash' }, { label: 'Rebase', value: 'rebase' }] }]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const number = String(input.number || ''); if (!number) return { ok: false, error: 'PR number is required' }
    const merge_method = ['merge', 'squash', 'rebase'].includes(String(input.method)) ? String(input.method) : 'merge'
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/pulls/${encodeURIComponent(number)}/merge`, { method: 'PUT', headers: { ...c.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ merge_method }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (data as any)?.message || `GitHub merge error (HTTP ${res.status})` }
    return { ok: true, message: `PR #${number} merged (${merge_method})`, data: { merged: (data as any)?.merged, sha: (data as any)?.sha } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'close_pr', policyActionId: 'crud_actions',
  schema: schema('github.close_pr', 'Close PR', 'archive', [REPO, PR_NUM]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const number = String(input.number || ''); if (!number) return { ok: false, error: 'PR number is required' }
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/pulls/${encodeURIComponent(number)}`, { method: 'PATCH', headers: { ...c.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'closed' }) })
    if (!res.ok) return { ok: false, error: await errFrom(res) }
    const data = await res.json()
    return { ok: true, message: `PR #${number} closed`, data: { number: data.number, state: data.state } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'delete_branch', policyActionId: 'crud_actions',
  schema: schema('github.delete_branch', 'Delete Branch', 'delete', [REPO, BRANCH]),
  async run(_ctx, input) {
    const c = gh(input); if (!c.ok) return c
    const branch = String(input.branch || '').trim(); if (!branch) return { ok: false, error: 'Branch name is required' }
    if (branch === 'main' || branch === 'master') return { ok: false, error: 'Refusing to delete the default branch' }
    const ref = branch.split('/').map(encodeURIComponent).join('/')
    const res = await fetch(`${API}/repos/${c.owner}/${c.name}/git/refs/heads/${ref}`, { method: 'DELETE', headers: c.headers })
    if (res.status !== 204) return { ok: false, error: `GitHub error (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}` }
    return { ok: true, message: `Branch deleted: ${branch}`, data: { branch } }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'rotate_token', policyActionId: 'rotate_credential',
  schema: schema('github.rotate_token', 'Rotate Token', 'edit', []),
  async run() {
    return { ok: false, error: 'GitHub personal access tokens cannot be rotated via API. Regenerate it at github.com/settings/tokens, then update GITHUB_WRITE_TOKEN in Vercel and redeploy.' }
  },
})

registerExecutor({
  providerId: 'github', actionId: 'manage_secrets', policyActionId: 'crud_actions',
  schema: schema('github.manage_secrets', 'Manage Secrets', 'create', [REPO, { id: 'name', label: 'Secret Name', type: 'text', required: true }, { id: 'value', label: 'Secret Value', type: 'text', required: true }]),
  async run() {
    return { ok: false, error: 'Setting an Actions secret requires libsodium sealed-box encryption of the value, and no crypto dependency is installed yet. Ask me to wire it and I will add the dependency plus the real implementation.' }
  },
})
