// saas/lib/audit/repoTarget.ts
// Resolve and read ANY public GitHub repository from a pasted URL (or owner/repo,
// or a bare path on the default repo). Used by the audit runner so a customer can
// paste their full repository URL and have the whole repo ingested.
//
// Public repos only: tree via the GitHub API, file contents via raw.githubusercontent.
// Private repos return a clear error (they need a connected GitHub account / OAuth,
// which is not wired yet) instead of failing silently.

export interface RepoTarget {
  repo: string      // "owner/name"
  branch: string    // resolved branch ('' until listRepoTree resolves it)
  subPath: string   // optional in-repo sub-path
  raw: string       // original input
}

const MAX_FILE_CHARS = 50000

/** Parse a GitHub URL / owner-repo into a target. Returns null if it isn't one. */
export function parseRepoUrl(input?: string): RepoTarget | null {
  const s = String(input || '').trim()
  if (!s) return null

  // https://github.com/owner/repo[.git][/tree|blob/<branch>/<subpath>][?#...]
  const url = s.match(
    /github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/\s]+)(?:\/([^\s?#]*))?)?(?:[?#].*)?\/?$/i,
  )
  if (url) {
    return {
      repo: `${url[1]}/${url[2]}`,
      branch: url[3] || '',
      subPath: (url[4] || '').replace(/\/+$/, ''),
      raw: s,
    }
  }

  // bare "owner/repo" (but not a deeper path like "saas/app/api")
  const bare = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (bare) {
    return { repo: `${bare[1]}/${bare[2]}`, branch: '', subPath: '', raw: s }
  }
  return null
}

async function ghHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'signalboost-audit',
  }
  const tok = process.env.GITHUB_TOKEN || process.env.GITHUB_WRITE_TOKEN
  if (tok) h.Authorization = `Bearer ${tok}`
  return h
}

async function defaultBranch(repo: string): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: await ghHeaders(), cache: 'no-store' })
    if (res.ok) {
      const d = await res.json()
      if (d && typeof d.default_branch === 'string') return d.default_branch
    }
  } catch { /* fall through */ }
  return 'main'
}

/** List the full recursive file tree of a public repo. */
export async function listRepoTree(
  repo: string,
  branch?: string,
): Promise<{ ok: boolean; branch: string; files: string[]; error?: string }> {
  const fetchTree = async (b: string) =>
    fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(b)}?recursive=1`, {
      headers: await ghHeaders(),
      cache: 'no-store',
    })

  try {
    let b = branch || (await defaultBranch(repo))
    let res = await fetchTree(b)
    if (res.status === 404 && b !== 'master') { b = 'master'; res = await fetchTree(b) }

    if (res.status === 404) {
      return { ok: false, branch: b, files: [], error: `Repository or branch not found: ${repo}. Public repos only for now — private repos need a connected GitHub account (not yet supported).` }
    }
    if (res.status === 403) {
      return { ok: false, branch: b, files: [], error: `Access denied or rate-limited for ${repo}. If it's private, connect a GitHub account (not yet supported); otherwise add a read-only GITHUB_TOKEN.` }
    }
    if (!res.ok) {
      return { ok: false, branch: b, files: [], error: `GitHub tree request failed (${res.status}) for ${repo}.` }
    }

    const data = await res.json()
    const files: string[] = Array.isArray(data?.tree)
      ? data.tree.filter((e: any) => e?.type === 'blob' && typeof e?.path === 'string').map((e: any) => e.path as string)
      : []
    return { ok: true, branch: b, files }
  } catch (err) {
    return { ok: false, branch: branch || 'main', files: [], error: err instanceof Error ? err.message : 'Failed to list repository.' }
  }
}

/** Read one file's content from a public repo via raw.githubusercontent. */
export async function readRepoFileFrom(
  repo: string,
  branch: string,
  path: string,
): Promise<{ ok: boolean; content: string; truncated: boolean }> {
  try {
    const clean = String(path || '').trim().replace(/^\/+/, '')
    if (!clean || clean.includes('..')) return { ok: false, content: '', truncated: false }
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${encodeURI(clean)}`, { cache: 'no-store' })
    if (!res.ok) return { ok: false, content: '', truncated: false }
    const text = await res.text()
    const truncated = text.length > MAX_FILE_CHARS
    return { ok: true, content: truncated ? text.slice(0, MAX_FILE_CHARS) : text, truncated }
  } catch {
    return { ok: false, content: '', truncated: false }
  }
}
