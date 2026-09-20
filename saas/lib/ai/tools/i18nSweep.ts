// saas/lib/ai/tools/i18nSweep.ts
// Discovery for the i18n sweep. The Chief of Staff is reactive — it only edits a
// file when told the exact path. This tool gives it the missing capability: find
// the NEXT component/page that still has hardcoded English, so the COS can grind
// through the backlog one file per commit without the owner identifying each one.
//
// Read-only: lists the repo tree and reads file contents over HTTPS. Never writes.
//
// Progress model: translated files are committed to the single branch ai/i18n-sweep
// (not main). So this tool reads content FROM ai/i18n-sweep when that branch exists
// (to see in-progress work as "done"), falling back to main otherwise. That lets the
// COS do a batch of files before the owner reviews and merges the whole branch.

const REPO = 'SignalBoost/signalboost-live'
const SWEEP_BRANCH = 'ai/i18n-sweep'
const COMPONENT_RE = /^saas\/(app|components)\/.*\.tsx$/

// A file is already internationalized if it uses any of the project's i18n
// mechanisms: the live-dict hook, the inline-COPY pattern, or t(dict, …).
function usesI18n(content: string): boolean {
  return (
    /useI18n\s*\(/.test(content) ||
    /\bconst\s+COPY\b/.test(content) ||
    /\bt\(\s*dict\b/.test(content) ||
    /useTranslation\s*\(/.test(content)
  )
}

// Heuristic: does the file contain hardcoded user-facing English worth translating?
// Looks for JSX text nodes (>Capitalized words<) and English-looking string props.
// Conservative on purpose — a file with no user text (pure logic) is skipped, not
// flagged, so the sweep doesn't churn on files that have nothing to translate.
function hasHardcodedEnglish(content: string): boolean {
  const jsxText = />\s*[A-Z][a-zA-Z]+(?:\s+[A-Za-z][a-zA-Z']*){0,8}\s*</
  const props = /(?:placeholder|title|aria-label|alt|label)\s*=\s*"[A-Z][^"{}]{2,}"/
  return jsxText.test(content) || props.test(content)
}

type ListResult = { ok: boolean; files: string[]; error?: string }

async function listComponentTsx(): Promise<ListResult> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'signalboost-i18n-sweep',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`,
      { headers, cache: 'no-store' },
    )
    if (!res.ok) {
      return { ok: false, files: [], error: `GitHub tree request failed (${res.status}).${res.status === 403 ? ' Rate limit — add a read-only GITHUB_TOKEN env var.' : ''}` }
    }
    const data = await res.json()
    const tree = Array.isArray(data?.tree) ? data.tree : []
    const files: string[] = tree
      .filter((e: any) => e?.type === 'blob' && typeof e?.path === 'string' && COMPONENT_RE.test(e.path))
      .map((e: any) => e.path as string)
      .sort()
    return { ok: true, files }
  } catch (err) {
    return { ok: false, files: [], error: err instanceof Error ? err.message : 'Unknown error listing repo tree.' }
  }
}

async function branchExists(branch: string): Promise<boolean> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'signalboost-i18n-sweep',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/branches/${encodeURIComponent(branch)}`, { headers, cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

async function readFileOnBranch(path: string, branch: string): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${branch}/${encodeURI(path)}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

// Flat result type — this repo is tsconfig strict:false, where discriminated
// unions do NOT narrow, so all fields are optional and read with guards.
export type SweepResult = {
  ok: boolean
  error?: string
  done?: boolean
  path?: string
  content?: string
  alreadyDone?: number
  remaining?: number
  totalComponents?: number
  branch?: string
}

// Find the next untranslated component. Optional afterPath resumes after the last
// file translated (files are scanned in sorted order), so the owner can drive the
// sweep with repeated "continue" without it re-offering a file already in progress.
export async function findNextUntranslatedComponent(afterPath?: string): Promise<SweepResult> {
  const listed = await listComponentTsx()
  if (!listed.ok) return { ok: false, error: listed.error || 'Could not list repo files.' }
  const candidates = listed.files
  if (candidates.length === 0) {
    return { ok: false, error: 'No .tsx files found under saas/app or saas/components.' }
  }

  // Read from the sweep branch if it exists (so in-progress translations count as
  // done), else from main.
  const branch = (await branchExists(SWEEP_BRANCH)) ? SWEEP_BRANCH : 'main'
  const after = String(afterPath || '').trim().replace(/^\/+/, '')

  let alreadyDone = 0
  const untranslated: string[] = []
  let nextPath = ''
  let nextContent = ''

  const BATCH = 12
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH)
    const contents = await Promise.all(batch.map(p => readFileOnBranch(p, branch)))
    for (let j = 0; j < batch.length; j++) {
      const path = batch[j]
      const content = contents[j]
      if (content == null) continue
      if (usesI18n(content)) {
        alreadyDone++
        continue
      }
      if (!hasHardcodedEnglish(content)) continue
      untranslated.push(path)
      if (!nextPath && (!after || path > after)) {
        nextPath = path
        nextContent = content
      }
    }
  }

  const totalComponents = candidates.length

  if (!nextPath) {
    if (untranslated.length === 0) {
      return { ok: true, done: true, totalComponents, alreadyDone, branch }
    }
    // Everything untranslated is at or before `afterPath` — wrap to the first one.
    nextPath = untranslated[0]
    const c = await readFileOnBranch(nextPath, branch)
    nextContent = c || ''
  }

  return {
    ok: true,
    done: false,
    path: nextPath,
    content: nextContent,
    alreadyDone,
    remaining: untranslated.length,
    totalComponents,
    branch,
  }
}

export function formatSweepForAI(r: SweepResult): string {
  if (!r.ok) {
    return `I18N SWEEP — could not scan the repo: ${r.error || 'unknown error'} Tell the owner discovery is temporarily unavailable; do not guess which file is next.`
  }
  const total = r.totalComponents || 0
  const done = r.alreadyDone || 0
  if (r.done) {
    return `I18N SWEEP COMPLETE — every component/page under saas/app and saas/components is internationalized (${done} of ${total} wired; the rest have no user-facing text). Nothing left to translate. Tell the owner the sweep is finished.`
  }
  const remaining = r.remaining || 0
  return [
    `I18N SWEEP — next file to translate. ${remaining} file(s) still have hardcoded English (of ${total} components; ${done} already wired). Reading from branch "${r.branch || 'main'}".`,
    ``,
    `PATH: ${r.path || ''}`,
    ``,
    `INSTRUCTIONS: Translate THIS ONE file into all five languages (en, es, pt, pl, ru) using the INLINE COPY pattern — a 'const COPY: Record<Lang, ...>' object inside the file plus language detection, exactly like app/not-found.tsx and the admin pages. Do NOT use the separate locale-file approach. Render every user-facing string from COPY[lang]; leave dynamic data ({variables}) alone. Commit the COMPLETE updated file to the branch ai/i18n-sweep via proposeCodeCommit. Then tell the owner: which file you did, that ~${Math.max(0, remaining - 1)} remain, and to merge the ai/i18n-sweep preview and say "continue" for the next file. One file per reply.`,
    ``,
    `CURRENT FILE CONTENT (${r.path || ''}):`,
    r.content || '',
  ].join('\n')
}
