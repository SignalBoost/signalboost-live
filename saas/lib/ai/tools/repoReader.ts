// saas/lib/ai/tools/repoReader.ts
// Read-only codebase access for the Chief of Staff ("eyes, not hands").
// Lists and reads files from the PUBLIC GitHub repo so the AI can answer
// questions about the real code instead of guessing. Physically read-only:
// only GET requests to public endpoints; no token, no write capability.
//
// Optional env var GITHUB_TOKEN (a fine-grained read-only PAT) raises GitHub
// API rate limits for the tree listing; file reads use raw.githubusercontent
// and need no token at all.

const REPO = 'SignalBoost/signalboost-live'
const BRANCH = 'main'
const MAX_FILE_CHARS = 50000
const TREE_CACHE_MS = 5 * 60 * 1000

type TreeEntry = { path: string; type: string; size?: number }

let treeCache: { at: number; entries: TreeEntry[] } | null = null

// ── List repository files (full tree, optionally filtered by prefix) ──────────
export async function listRepoFiles(
  prefix?: string,
): Promise<{ ok: boolean; files: string[]; error?: string }> {
  try {
    if (!treeCache || Date.now() - treeCache.at > TREE_CACHE_MS) {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'signalboost-chief-of-staff',
      }
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
      }

      const res = await fetch(
        `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`,
        { headers, cache: 'no-store' },
      )

      if (!res.ok) {
        return {
          ok: false,
          files: [],
          error: `GitHub tree request failed (${res.status}). ${res.status === 403 ? 'Rate limit — add a read-only GITHUB_TOKEN env var to raise it.' : ''}`,
        }
      }

      const data = await res.json()
      const entries: TreeEntry[] = Array.isArray(data?.tree)
        ? data.tree
            .filter((e: any) => e?.type === 'blob' && typeof e?.path === 'string')
            .map((e: any) => ({ path: e.path, type: e.type, size: e.size }))
        : []

      treeCache = { at: Date.now(), entries }
    }

    const clean = String(prefix || '').trim().replace(/^\/+/, '')
    const files = treeCache.entries
      .map(e => e.path)
      .filter(p => !clean || p.startsWith(clean))
      .slice(0, 400)

    return { ok: true, files }
  } catch (err) {
    return { ok: false, files: [], error: err instanceof Error ? err.message : 'Unknown error listing repo' }
  }
}

// ── Read one file from the repo ─────────────────────────────────────────────────
export async function readRepoFile(
  path: string,
): Promise<{ ok: boolean; content: string; truncated: boolean; error?: string }> {
  try {
    const clean = String(path || '').trim().replace(/^\/+/, '')
    if (!clean || clean.includes('..')) {
      return { ok: false, content: '', truncated: false, error: 'Invalid path.' }
    }

    const res = await fetch(
      `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodeURI(clean)}`,
      { cache: 'no-store' },
    )

    if (res.status === 404) {
      return { ok: false, content: '', truncated: false, error: `File not found: ${clean}. Use listRepoFiles to find the correct path.` }
    }
    if (!res.ok) {
      return { ok: false, content: '', truncated: false, error: `Fetch failed (${res.status}).` }
    }

    const text = await res.text()
    const truncated = text.length > MAX_FILE_CHARS
    return {
      ok: true,
      content: truncated ? text.slice(0, MAX_FILE_CHARS) : text,
      truncated,
    }
  } catch (err) {
    return { ok: false, content: '', truncated: false, error: err instanceof Error ? err.message : 'Unknown error reading file' }
  }
}

// ── Formatting for tool results ─────────────────────────────────────────────────
export function formatFileListForAI(prefix: string | undefined, files: string[]): string {
  if (!files.length) {
    return `No files found${prefix ? ` under "${prefix}"` : ''}. Try a different prefix or list without one.`
  }
  return `REPO FILES (${REPO}@${BRANCH}${prefix ? `, under "${prefix}"` : ''}, ${files.length} shown):\n${files.join('\n')}`
}

export function formatFileForAI(path: string, content: string, truncated: boolean): string {
  return `FILE: ${path} (${REPO}@${BRANCH})${truncated ? ' [TRUNCATED — file exceeds the read limit; reason about the visible portion only and say so]' : ''}\n\n${content}`
}
