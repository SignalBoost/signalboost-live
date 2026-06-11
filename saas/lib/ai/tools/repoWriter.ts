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

type GhResult<T> = { ok: true; data: T } | { ok: false; error: string }

function token(): string | null {
  return process.env.GITHUB_WRITE_TOKEN || null
}

async function gh(path: string, init?: RequestInit): Promise<GhResult<any>> {
  const t = token()
  if (!t) return { ok: false, error: 'GITHUB_WRITE_TOKEN is not configured. Ask the owner to add it in Vercel env settings.' }
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: `GitHub ${init?.method || 'GET'} ${path} failed (${res.status}): ${body?.message || 'unknown error'}` }
    }
    return { ok: true, data: body }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'GitHub request failed' }
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

function assertNotProtected(branch: string): string | null {
  if (branch === 'main' || branch === 'master' || !branch.startsWith(BRANCH_PREFIX)) {
    return `Refused: commits are only allowed to ${BRANCH_PREFIX}* branches, never ${branch}.`
  }
  return null
}

// ── Ensure the branch exists (create from main HEAD if missing) ────────────────
export async function ensureBranch(rawBranch: string): Promise<GhResult<{ branch: string; created: boolean }>> {
  const branch = sanitizeBranchName(rawBranch)
  if (!branch) return { ok: false, error: `Invalid branch name "${rawBranch}". Use a short descriptive name; it will be prefixed with ${BRANCH_PREFIX}.` }
  const guard = assertNotProtected(branch)
  if (guard) return { ok: false, error: guard }

  const existing = await gh(`/repos/${REPO}/git/ref/heads/${encodeURIComponent(branch)}`)
  if (existing.ok) return { ok: true, data: { branch, created: false } }

  const base = await gh(`/repos/${REPO}/git/ref/heads/${BASE_BRANCH}`)
  if (!base.ok) return { ok: false, error: `Could not read ${BASE_BRANCH} HEAD: ${base.error}` }
  const sha = base.data?.object?.sha
  if (!sha) return { ok: false, error: `Could not resolve ${BASE_BRANCH} HEAD sha.` }

  const created = await gh(`/repos/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  })
  if (!created.ok) return { ok: false, error: created.error }
  return { ok: true, data: { branch, created: true } }
}

// ── Commit one full file to a branch (create or replace) ───────────────────────
export async function commitFileToBranch(params: {
  branch: string
  path: string
  content: string
  message: string
}): Promise<GhResult<{ branch: string; path: string; commitSha: string; previewNote: string; compareUrl: string }>> {
  const branchResult = await ensureBranch(params.branch)
  if (!branchResult.ok) return branchResult
  const branch = branchResult.data.branch

  const filePath = String(params.path || '').trim().replace(/^\/+/, '')
  if (!filePath || filePath.includes('..')) return { ok: false, error: `Invalid file path "${params.path}".` }
  const content = String(params.content ?? '')
  if (!content.trim()) return { ok: false, error: 'Refused: empty file content. Full file contents are required.' }
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    return { ok: false, error: `Refused: file exceeds ${MAX_FILE_BYTES} bytes. Split it into smaller modules.` }
  }

  // Existing file on this branch? Need its sha to update.
  let existingSha: string | undefined
  const current = await gh(`/repos/${REPO}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`)
  if (current.ok && current.data?.sha) existingSha = current.data.sha

  const put = await gh(`/repos/${REPO}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: String(params.message || `AI: update ${filePath}`).slice(0, 200),
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  })
  if (!put.ok) return { ok: false, error: put.error }

  return {
    ok: true,
    data: {
      branch,
      path: filePath,
      commitSha: put.data?.commit?.sha || 'unknown',
      previewNote: 'Vercel is building a preview deployment for this branch now.',
      compareUrl: `https://github.com/${REPO}/compare/${BASE_BRANCH}...${encodeURIComponent(branch)}`,
    },
  }
}

// ── List open AI branches (for status questions) ────────────────────────────────
export async function listAiBranches(): Promise<GhResult<Array<{ name: string; compareUrl: string }>>> {
  const res = await gh(`/repos/${REPO}/branches?per_page=100`)
  if (!res.ok) return res
  const branches = (Array.isArray(res.data) ? res.data : [])
    .filter((b: any) => typeof b?.name === 'string' && b.name.startsWith(BRANCH_PREFIX))
    .map((b: any) => ({ name: b.name, compareUrl: `https://github.com/${REPO}/compare/${BASE_BRANCH}...${encodeURIComponent(b.name)}` }))
  return { ok: true, data: branches }
}

// ── Format results for the AI ───────────────────────────────────────────────────
export function formatCommitResultForAI(result: Awaited<ReturnType<typeof commitFileToBranch>>): string {
  if (!result.ok) return `COMMIT FAILED: ${result.error}`
  const r = result.data
  return `COMMIT SUCCEEDED on branch "${r.branch}" (never main).
File: ${r.path}
Commit: ${r.commitSha}
${r.previewNote}
Review & merge here: ${r.compareUrl}
Tell the owner: the change is on a preview branch — merge it in GitHub once the Vercel preview is green. Production is untouched until they merge.`
}

export function formatBranchListForAI(result: Awaited<ReturnType<typeof listAiBranches>>): string {
  if (!result.ok) return `Could not list branches: ${result.error}`
  if (result.data.length === 0) return 'There are no open ai/* branches right now.'
  return `Open AI branches awaiting review:\n${result.data.map(b => `• ${b.name} — ${b.compareUrl}`).join('\n')}`
}
