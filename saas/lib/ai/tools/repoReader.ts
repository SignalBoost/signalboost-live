// saas/lib/ai/tools/repoReader.ts
// Read-only codebase access for the Chief of Staff ("eyes, not hands").
// Lists and reads files from the SignalBoost GitHub repository so the AI can
// answer questions about the real code instead of guessing.
//
// PRIVATE-REPO SUPPORT:
// - GITHUB_TOKEN is preferred and only needs Contents: read.
// - GITHUB_WRITE_TOKEN is accepted as a fallback because the existing COS writer
//   already requires Contents: read/write and therefore can also perform GETs.
// - Reads use GitHub's authenticated Contents API. We no longer rely on
//   raw.githubusercontent.com for private files, which returns 404 when unauthenticated.
//
// This module remains physically read-only: every GitHub call made here is GET-only.

const REPO = 'SignalBoost/signalboost-live'
const BRANCH = 'main'
const MAX_FILE_CHARS = 50000
const TREE_CACHE_MS = 5 * 60 * 1000

type TreeEntry = { path: string; type: string; size?: number }

let treeCache: { at: number; entries: TreeEntry[] } | null = null

function githubReadToken(): string {
  return String(process.env.GITHUB_TOKEN || process.env.GITHUB_WRITE_TOKEN || '').trim()
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'signalboost-chief-of-staff',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = githubReadToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function decodeGithubContent(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  return Buffer.from(value.replace(/\n/g, ''), 'base64').toString('utf8')
}

// ── List repository files (full tree, optionally filtered by prefix) ──────────
export async function listRepoFiles(
  prefix?: string,
): Promise<{ ok: boolean; files: string[]; error?: string }> {
  try {
    if (!treeCache || Date.now() - treeCache.at > TREE_CACHE_MS) {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`,
        { headers: githubHeaders(), cache: 'no-store' },
      )

      if (!res.ok) {
        return {
          ok: false,
          files: [],
          error: `GitHub tree request failed (${res.status}). ${res.status === 401 || res.status === 404 ? 'The repository is private or the read token is missing/invalid. Configure GITHUB_TOKEN with Contents: read (or GITHUB_WRITE_TOKEN).' : res.status === 403 ? 'GitHub denied the request or rate-limited it. Verify token permissions.' : ''}`,
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

// ── Read one file from the repo ───────────────────────────────────────────────
export async function readRepoFile(
  path: string,
): Promise<{ ok: boolean; content: string; truncated: boolean; error?: string }> {
  try {
    const clean = String(path || '').trim().replace(/^\/+/, '')
    if (!clean || clean.includes('..')) {
      return { ok: false, content: '', truncated: false, error: 'Invalid path.' }
    }

    const encodedPath = clean.split('/').map(part => encodeURIComponent(part)).join('/')
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${encodedPath}?ref=${encodeURIComponent(BRANCH)}`,
      { headers: githubHeaders(), cache: 'no-store' },
    )

    if (res.status === 404) {
      const authHint = githubReadToken()
        ? 'The path does not exist on main, or the configured GitHub token cannot read this private repository.'
        : 'The repository is private and no GitHub read credential is configured. Add GITHUB_TOKEN with Contents: read (or GITHUB_WRITE_TOKEN).'
      return { ok: false, content: '', truncated: false, error: `File not found or inaccessible: ${clean}. ${authHint} Use listRepoFiles to confirm the exact path.` }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        content: '',
        truncated: false,
        error: `GitHub denied repository read (${res.status}). Verify GITHUB_TOKEN has Contents: read access to ${REPO}, or configure GITHUB_WRITE_TOKEN.`,
      }
    }
    if (!res.ok) {
      return { ok: false, content: '', truncated: false, error: `GitHub contents request failed (${res.status}).` }
    }

    const data = await res.json()
    if (!data || data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string') {
      return {
        ok: false,
        content: '',
        truncated: false,
        error: `GitHub did not return file content for ${clean}. The path may refer to a directory, submodule, or unsupported object.`,
      }
    }

    const text = decodeGithubContent(data.content)
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

// ── Formatting for tool results ───────────────────────────────────────────────
export function formatFileListForAI(prefix: string | undefined, files: string[]): string {
  if (!files.length) {
    return `No files found${prefix ? ` under "${prefix}"` : ''}. Try a different prefix or list without one.`
  }
  return `REPO FILES (${REPO}@${BRANCH}${prefix ? `, under "${prefix}"` : ''}, ${files.length} shown):\n${files.join('\n')}`
}

export function formatFileForAI(path: string, content: string, truncated: boolean): string {
  return `FILE: ${path} (${REPO}@${BRANCH})${truncated ? ' [TRUNCATED — file exceeds the read limit; reason about the visible portion only and say so]' : ''}\n\n${content}`
}
