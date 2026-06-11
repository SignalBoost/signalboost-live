// saas/lib/ai/tools/repoWriter.ts
// Step 2 "Hands": lets the Chief of Staff commit code to the repo — but ONLY
// to ai/* branches, never main. Vercel builds a preview for every branch push;
// the owner reviews and merges in GitHub. Production is never touched directly.
//
// Requires env var GITHUB_WRITE_TOKEN: a fine-grained PAT scoped to this repo
// with Contents read/write only. Deliberately separate from the read-only
// GITHUB_TOKEN used by repoReader.

const REPO = 'SignalBoost/signalboost-live'
const BASE_BRANCH = 'main'
const BRANCH_PREFIX = 'ai/'
const API = 'https://api.github.com'
const MAX_FILE_BYTES = 400_000

type GhResponse = { ok: boolean; status: number; data: any; error: string }

function token(): string | null {
  return process.env.GITHUB_WRITE_TOKEN || null
}

async function gh(path: string, init?: RequestInit): Promise<GhResponse> {
  const t = token()
  if (!t) {
    return { ok: false, status: 0, data: null, error: 'GITHUB_WRITE_TOKEN is not configured. Ask the owner to add it in Vercel env settings.' }
  }
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init && init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = body && body.message ? body.message : 'unknown error'
      return { ok: false, status: res.status, data: body, error: `GitHub ${init && init.method ? init.method : 'GET'} ${path} failed (${res.status}): ${message}` }
    }
    return { ok: true, status: res.status, data: body, error: '' }
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : 'GitHub request failed' }
  }
}

// ── Branch safety ───────────────────────────────────────────────────────────────
export function sanitizeBranchName(raw: string): string | null {
  let name = String(raw || '').trim().toLowerCase()
  if (!name.startsWith(BRANCH_PREFIX)) name = BRANCH_PREFIX + name
  name = name.replace(/[^a-z0-9/_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
  if (name === BRANCH_PREFIX || name.length < BRANCH_PREFIX.length + 2 || name.length > 80) return null
  if (name === 'main' || name === 'master' || name.includes('..')) return null
  return name
}

function protectionError(branch: string): string {
  if (branch === 'main' || branch === 'master' || !branch.startsWith(BRANCH_PREFIX)) {
    return `Refused: commits are only allowed to ${BRANCH_PREFIX}* branches, never ${branch}.`
  }
  return ''
}

// ── Ensure the branch exists (create from main HEAD if missing) ────────────────
export type EnsureBranchResult = { ok: boolean; branch: string; created: boolean; error: string }

export async function ensureBranch(rawBranch: string): Promise<EnsureBranchResult> {
  const branch = sanitizeBranchName(rawBranch)
  if (!branch) {
    return { ok: false, branch: '', created: false, error: `Invalid branch name "${rawBranch}". Use a short descriptive name; it will be prefixed with ${BRANCH_PREFIX}.` }
  }
  const guard = protectionError(branch)
  if (guard) return { ok: false, branch, created: false, error: guard }

  const existing = await gh(`/repos/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`)
  if (existing.ok) return { ok: true, branch, created: false, error: '' }
  if (existing.status !== 404 && existing.status !== 0) {
    return { ok: false, branch, created: false, error: existing.error }
  }

  const base = await gh(`/repos/${REPO}/git/ref/heads/${BASE_BRANCH}`)
  if (!base.ok) return { ok: false, branch, created: false, error: `Could not read ${BASE_BRANCH} HEAD: ${base.error}` }
  const sha = base.data && base.data.object ? base.data.object.sha : null
  if (!sha) return { ok: false, branch, created: false, error: `Could not resolve ${BASE_BRANCH} HEAD sha.` }

  const created = await gh(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  })
  if (!created.ok) return { ok: false, branch, created: false, error: created.error }
  return { ok: true, branch, created: true, error: '' }
}

// ── Commit one full file to a branch (create or replace) ───────────────────────
export type CommitResult = {
  ok: boolean
  branch: string
  path: string
  commitSha: string
  compareUrl: string
  error: string
}

export async function commitFileToBranch(params: {
  branch: string
  path: string
  content: string
  message: string
}): Promise<CommitResult> {
  const empty = { branch: '', path: '', commitSha: '', compareUrl: '' }

  const branchResult = await ensureBranch(params.branch)
  if (!branchResult.ok) return { ok: false, ...empty, error: branchResult.error }
  const branch = branchResult.branch

  const filePath = String(params.path || '').trim().replace(/^\/+/, '')
  if (!filePath || filePath.includes('..')) {
    return { ok: false, ...empty, branch, error: `Invalid file path "${params.path}".` }
  }
  const content = String(params.content == null ? '' : params.content)
  if (!content.trim()) {
    return { ok: false, ...empty, branch, path: filePath, error: 'Refused: empty file content. Full file contents are required.' }
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    return { ok: false, ...empty, branch, path: filePath, error: `Refused: file exceeds ${MAX_FILE_BYTES} bytes. Split it into smaller modules.` }
  }

  const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/')

  // Existing file on this branch? Need its sha to update.
  let existingSha = ''
  const current = await gh(`/repos/${REPO}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`)
  if (current.ok && current.data && current.data.sha) existingSha = current.data.sha

  const body: Record<string, string> = {
    message: String(params.message || `AI: update ${filePath}`).slice(0, 200),
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
  }
  if (existingSha) body.sha = existingSha

  const put = await gh(`/repos/${REPO}/contents/${encodedPath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!put.ok) return { ok: false, ...empty, branch, path: filePath, error: put.error }

  const commitSha = put.data && put.data.commit && put.data.commit.sha ? put.data.commit.sha : 'unknown'
  return {
    ok: true,
    branch,
    path: filePath,
    commitSha,
    compareUrl: `https://github.com/${REPO}/compare/${BASE_BRANCH}...${encodeURIComponent(branch)}`,
    error: '',
  }
}

// ── List open AI branches (for status questions) ────────────────────────────────
export type AiBranch = { name: string; compareUrl: string }
export type BranchListResult = { ok: boolean; branches: AiBranch[]; error: string }

export async function listAiBranches(): Promise<BranchListResult> {
  const res = await gh(`/repos/${REPO}/branches?per_page=100`)
  if (!res.ok) return { ok: false, branches: [], error: res.error }
  const all = Array.isArray(res.data) ? res.data : []
  const branches: AiBranch[] = []
  for (const b of all) {
    if (b && typeof b.name === 'string' && b.name.startsWith(BRANCH_PREFIX)) {
      branches.push({ name: b.name, compareUrl: `https://github.com/${REPO}/compare/${BASE_BRANCH}...${encodeURIComponent(b.name)}` })
    }
  }
  return { ok: true, branches, error: '' }
}

// ── Format results for the AI ───────────────────────────────────────────────────
export function formatCommitResultForAI(result: CommitResult): string {
  if (!result.ok) return `COMMIT FAILED: ${result.error}`
  return `COMMIT SUCCEEDED on branch "${result.branch}" (never main).
File: ${result.path}
Commit: ${result.commitSha}
Vercel is building a preview deployment for this branch now.
Review & merge here: ${result.compareUrl}
Tell the owner: the change is on a preview branch — merge it in GitHub once the Vercel preview is green. Production is untouched until they merge.`
}

export function formatBranchListForAI(result: BranchListResult): string {
  if (!result.ok) return `Could not list branches: ${result.error}`
  if (result.branches.length === 0) return 'There are no open ai/* branches right now.'
  const lines = result.branches.map(b => `• ${b.name} — ${b.compareUrl}`)
  return `Open AI branches awaiting review:\n${lines.join('\n')}`
}
