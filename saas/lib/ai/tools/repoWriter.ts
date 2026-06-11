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

// ── Fragment / elision guardrail ────────────────────────────────────────────────
// The model must commit COMPLETE files. Reject content containing elision
// markers ("// ... rest of the file", "[rest of the COPY object]", etc.) so a
// fragment can never reach a branch, regardless of what the prompt says.
const ELISION_PATTERNS: RegExp[] = [
  /^\s*\/\/\s*\.\.\./m,                       // a line starting with "// ..."
  /^\s*\.\.\.\s*$/m,                          // a bare "..." line
  /\.\.\.\s*\[?\s*rest of/i,                  // "... [rest of"
  /\[\s*rest of/i,                             // "[rest of the COPY object]"
  /rest of (the )?(file|code|component|object|imports|logic|styles)/i,
  /remains? unchanged/i,
  /unchanged (code|section|block)/i,
  /same as (before|above|original|previous)/i,
  /\/\/\s*(existing|previous|original) code/i,
  /\/\*\s*\.\.\.\s*\*\//,                     // "/* ... */"
  /<!--\s*\.\.\./,                             // "<!-- ..."
]

function findElision(content: string): string {
  for (const pattern of ELISION_PATTERNS) {
    const match = content.match(pattern)
    if (match) return match[0].trim().slice(0, 60)
  }
  return ''
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

// ── Preflight QA validators ─────────────────────────────────────────────────────
// Machine-checks every commit so the owner never has to review raw diffs:
// real paths only, real imports only, hooks need 'use client', edits must
// actually be edits (not from-memory rewrites).

let treeCache: { ref: string; paths: Set<string>; fetchedAt: number } | null = null

async function getRepoPaths(ref: string): Promise<Set<string> | null> {
  if (treeCache && treeCache.ref === ref && Date.now() - treeCache.fetchedAt < 60_000) {
    return treeCache.paths
  }
  const res = await gh(`/repos/${REPO}/git/trees/${encodeURIComponent(ref)}?recursive=1`)
  if (!res.ok) return null
  const items = res.data && Array.isArray(res.data.tree) ? res.data.tree : []
  const paths = new Set<string>()
  for (const item of items) {
    if (item && item.type === 'blob' && typeof item.path === 'string') paths.add(item.path)
  }
  treeCache = { ref, paths, fetchedAt: Date.now() }
  return paths
}

let pkgCache: { ref: string; deps: Set<string>; fetchedAt: number } | null = null

async function getPackageDeps(ref: string): Promise<Set<string> | null> {
  if (pkgCache && pkgCache.ref === ref && Date.now() - pkgCache.fetchedAt < 60_000) {
    return pkgCache.deps
  }
  const res = await gh(`/repos/${REPO}/contents/saas/package.json?ref=${encodeURIComponent(ref)}`)
  if (!res.ok || !res.data || !res.data.content) return null
  try {
    const json = JSON.parse(Buffer.from(String(res.data.content), 'base64').toString('utf8'))
    const deps = new Set<string>()
    for (const key of Object.keys(json.dependencies || {})) deps.add(key)
    for (const key of Object.keys(json.devDependencies || {})) deps.add(key)
    pkgCache = { ref, deps, fetchedAt: Date.now() }
    return deps
  } catch {
    return null
  }
}

export function suggestPaths(paths: Set<string>, wanted: string): string[] {
  const base = (wanted.split('/').pop() || '').toLowerCase()
  const stem = base.replace(/\.[^.]+$/, '')
  const out: string[] = []
  for (const p of paths) {
    if (out.length >= 5) break
    const lower = p.toLowerCase()
    const pb = lower.split('/').pop() || ''
    if (!stem) break
    if (pb === base || pb.replace(/\.[^.]+$/, '') === stem || lower.includes('/' + stem + '/')) out.push(p)
  }
  return out
}

export function extractImports(content: string): string[] {
  const specs: string[] = []
  const re = /(?:^|\n)\s*import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null = re.exec(content)
  while (match) {
    if (match[1]) specs.push(match[1])
    match = re.exec(content)
  }
  return specs
}

function normalizePath(parts: string[]): string {
  const out: string[] = []
  for (const part of parts.join('/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { out.pop(); continue }
    out.push(part)
  }
  return out.join('/')
}

const MODULE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']

export function findBadImports(content: string, filePath: string, paths: Set<string>, deps: Set<string>): string[] {
  const bad: string[] = []
  const fileDir = filePath.split('/').slice(0, -1).join('/')
  for (const spec of extractImports(content)) {
    if (spec.startsWith('node:')) continue
    let target = ''
    if (spec.startsWith('@/')) {
      target = 'saas/' + spec.slice(2)
    } else if (spec.startsWith('./') || spec.startsWith('../')) {
      target = normalizePath([fileDir, spec])
    } else {
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
      if (pkg === 'react' || pkg === 'react-dom' || pkg === 'next' || deps.has(pkg)) continue
      bad.push(spec)
      continue
    }
    let found = false
    for (const suffix of MODULE_SUFFIXES) {
      if (paths.has(target + suffix)) { found = true; break }
    }
    if (!found) bad.push(spec)
  }
  return bad
}

export function preservedFraction(original: string, updated: string): number {
  const originalLines = original.split('\n').map(l => l.trim()).filter(l => l.length > 3)
  if (originalLines.length === 0) return 1
  const updatedSet = new Set(updated.split('\n').map(l => l.trim()))
  let kept = 0
  for (const line of originalLines) {
    if (updatedSet.has(line)) kept++
  }
  return kept / originalLines.length
}

export function missingUseClient(filePath: string, content: string): boolean {
  if (!/\.(tsx|jsx)$/.test(filePath)) return false
  const usesHooks = /\buse(State|Effect|Reducer|Ref|Memo|Callback|Context|LayoutEffect|Transition)\s*\(/.test(content)
  if (!usesHooks) return false
  return !/^\s*['"]use client['"]/m.test(content)
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
  createNewFile?: boolean
  allowRewrite?: boolean
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
  const elision = findElision(content)
  if (elision) {
    return { ok: false, ...empty, branch, path: filePath, error: `Refused: the content is a FRAGMENT, not a complete file — it contains the elision marker "${elision}". Re-read the current file with readRepoFile and provide the COMPLETE file with every line written out (including full COPY/translation objects). Never abbreviate with comments.` }
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    return { ok: false, ...empty, branch, path: filePath, error: `Refused: file exceeds ${MAX_FILE_BYTES} bytes. Split it into smaller modules.` }
  }

  if (missingUseClient(filePath, content)) {
    return { ok: false, ...empty, branch, path: filePath, error: `Refused: this component uses React hooks but is missing the 'use client' directive on the first line. Add 'use client' at the very top and resubmit the complete file.` }
  }

  const encodedPath = encodeURIComponent(filePath).replace(/%2F/g, '/')

  // Existing file on this branch? Need its sha (to update) and content (to validate).
  let existingSha = ''
  let existingContent: string | null = null
  const current = await gh(`/repos/${REPO}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`)
  if (current.ok && current.data && current.data.sha) {
    existingSha = current.data.sha
    if (current.data.content && current.data.encoding === 'base64') {
      try { existingContent = Buffer.from(String(current.data.content), 'base64').toString('utf8') } catch {}
    }
  }

  const repoPaths = await getRepoPaths(branch)

  // PREFLIGHT 1 — real paths only: committing to a non-existent path is almost
  // always a hallucinated file. Require an explicit createNewFile flag.
  if (!existingSha && params.createNewFile !== true) {
    const hints = repoPaths ? suggestPaths(repoPaths, filePath) : []
    const hintText = hints.length ? ` Did you mean one of these existing files? ${hints.join(' | ')}.` : ''
    return { ok: false, ...empty, branch, path: filePath, error: `Refused: "${filePath}" does not exist in the repository, so this would CREATE a new file.${hintText} If you intended to MODIFY an existing file, re-read the repo and use its exact path. Only if the owner explicitly approved creating a brand-new file, retry with createNewFile: true.` }
  }

  // PREFLIGHT 2 — edits must be edits: a "modification" that keeps under half
  // of the original lines is a from-memory rewrite, the main source of broken
  // commits. Require explicit allowRewrite for genuine full rewrites.
  if (existingContent && params.allowRewrite !== true) {
    const kept = preservedFraction(existingContent, content)
    if (kept < 0.5) {
      return { ok: false, ...empty, branch, path: filePath, error: `Refused: only ${Math.round(kept * 100)}% of the original file's lines survive in your version — this looks like a rewrite from memory, not an edit of the real file. Call readRepoFile on "${filePath}", apply the minimal change to that exact content, and resubmit the complete file. Only if the owner explicitly approved a full rewrite, retry with allowRewrite: true.` }
    }
  }

  // PREFLIGHT 3 — real imports only: every import must resolve to a real repo
  // file or a real package.json dependency.
  if (repoPaths) {
    const deps = await getPackageDeps(branch)
    if (deps) {
      const badImports = findBadImports(content, filePath, repoPaths, deps)
      if (badImports.length) {
        return { ok: false, ...empty, branch, path: filePath, error: `Refused: these imports do not exist in the repository or its dependencies: ${badImports.join(', ')}. Do not invent modules. Read the real file with readRepoFile and keep its existing imports, or use only modules that actually exist.` }
      }
    }
  }

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
  return `Refused-list fallback`
}
