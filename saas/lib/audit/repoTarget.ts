// saas/lib/audit/repoTarget.ts
// Resolve and read GitHub repositories from a pasted URL (or owner/repo, or a bare
// path on the default repo). Private repositories are supported when either the
// read-only GITHUB_TOKEN or the existing GITHUB_WRITE_TOKEN can read Contents.

export interface RepoTarget {
  repo: string
  branch: string
  subPath: string
  raw: string
}

const MAX_FILE_CHARS = 50000

export function parseRepoUrl(input?: string): RepoTarget | null {
  const s = String(input || '').trim()
  if (!s) return null

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

  const bare = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (bare) return { repo: `${bare[1]}/${bare[2]}`, branch: '', subPath: '', raw: s }
  return null
}

function githubToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_WRITE_TOKEN || null
}

async function ghHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'signalboost-audit',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const tok = githubToken()
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
  } catch {}
  return 'main'
}

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

    if (res.status === 401) {
      return { ok: false, branch: b, files: [], error: `GitHub authentication failed for ${repo}. Check GITHUB_TOKEN/GITHUB_WRITE_TOKEN.` }
    }
    if (res.status === 403) {
      return { ok: false, branch: b, files: [], error: `GitHub denied access to ${repo}. Ensure the configured token has Contents: read permission.` }
    }
    if (res.status === 404) {
      return { ok: false, branch: b, files: [], error: `Repository or branch not found: ${repo}@${b}. For a private repo, verify the configured token can access it.` }
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

function decodeBase64(value: string): string {
  return Buffer.from(value.replace(/\n/g, ''), 'base64').toString('utf8')
}

export async function readRepoFileFrom(
  repo: string,
  branch: string,
  path: string,
): Promise<{ ok: boolean; content: string; truncated: boolean }> {
  try {
    const clean = String(path || '').trim().replace(/^\/+/, '')
    if (!clean || clean.includes('..')) return { ok: false, content: '', truncated: false }

    const url = `https://api.github.com/repos/${repo}/contents/${clean.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`
    const res = await fetch(url, { headers: await ghHeaders(), cache: 'no-store' })
    if (!res.ok) return { ok: false, content: '', truncated: false }

    const data = await res.json()
    if (!data || data.type !== 'file' || typeof data.content !== 'string') {
      return { ok: false, content: '', truncated: false }
    }
    const text = data.encoding === 'base64' ? decodeBase64(data.content) : String(data.content)
    const truncated = text.length > MAX_FILE_CHARS
    return { ok: true, content: truncated ? text.slice(0, MAX_FILE_CHARS) : text, truncated }
  } catch {
    return { ok: false, content: '', truncated: false }
  }
}
