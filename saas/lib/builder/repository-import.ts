import { builderFilePath } from './file-chunks.ts'

export type BuilderRepositoryTarget = Readonly<{ owner: string; repo: string; ref: string; directory: string; refPath?: string }>
export function builderRepositoryTarget(objective: string, value?: unknown): BuilderRepositoryTarget | null {
  const explicit = typeof value === 'string' ? value : ''
  const link = explicit || objective.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:tree|commit)\/[A-Za-z0-9_./-]+)?/)?.[0]
  if (!link) return null
  const url = new URL(link)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw new Error('builder_repository_url_invalid')
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1)
  const [owner, rawRepo, kind, ref, ...directory] = parts
  const repo = rawRepo?.replace(/\.git$/, '')
  if (![owner, repo].every(value => value && /^[A-Za-z0-9_.-]+$/.test(value) && value !== '..')
    || (kind && !['tree', 'commit'].includes(kind)) || (kind && !ref)) throw new Error('builder_repository_url_invalid')
  if (`${owner}/${repo}`.toLowerCase() === 'signalboost/signalboost-live') throw new Error('builder_platform_repository_requires_owner_lane')
  const folder = directory.length ? builderFilePath(directory.join('/')) : ''
  return { owner, repo, ref: ref || 'HEAD', directory: folder, ...(kind === 'tree' ? { refPath: [ref, ...directory].join('/') } : {}) }
}

/** A link is source context, not permission to start an executable job. */
export function builderRepositoryImportIntent(objective: string): boolean {
  const request = objective.replace(/https?:\/\/\S+/g, '').replace(/`[^`]*`|"[^"\n]*"/g, '').trim()
  return /^(?:please\s+)?(?:import|clone|build|fix|repair|debug|implement|modify|edit|run|test)\b/i.test(request)
    || /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:import|clone|build|fix|repair|debug|implement|modify|edit|run|test)\b/i.test(request)
}

const SOURCE = /(?:\.(?:[cm]?[jt]sx?|json|html?|css|scss|md|txt|ya?ml|toml|py|go|rs|java|sql|sh|csv)|(?:^|\/)(?:Dockerfile|Makefile))$/i
function allowedSource(path: string): boolean {
  return SOURCE.test(path) && !path.split('/').some(part => /^(?:\.git|node_modules|\.next|dist|vendor|\.env(?:\..*)?|\.npmrc|credentials.*|secrets.*)$/i.test(part))
}

async function boundedText(fetcher: typeof fetch, url: string, maximum: number, deadline: number): Promise<string> {
  if (Date.now() >= deadline) throw new Error('builder_repository_import_timeout')
  const response = await fetcher(url, { headers: { Accept: 'application/vnd.github+json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now()))) })
  if (!response.ok) throw new Error(response.status === 404 ? 'builder_repository_not_public_or_missing' : 'builder_repository_fetch_failed')
  if (Number(response.headers.get('content-length') || 0) > maximum) throw new Error('builder_repository_too_large')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('builder_repository_empty_response')
  const parts: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maximum) throw new Error('builder_repository_too_large')
      parts.push(value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))
}

/** Public source reads only. No platform GitHub token, write authority or remote executable enters this path. */
export async function importBuilderRepository(target: BuilderRepositoryTarget, fetcher: typeof fetch = fetch) {
  const deadline = Date.now() + 60_000
  const root = `${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`
  let directory = target.directory
  let commit: { sha: string } | undefined
  const candidates = target.refPath ? target.refPath.split('/') : [target.ref]
  if (candidates.length > 32) throw new Error('builder_repository_url_invalid')
  // GitHub refs can contain slashes. Only a missing candidate permits trying a shorter ref.
  for (let length = candidates.length; length > 0; length--) {
    const ref = candidates.slice(0, length).join('/')
    try {
      commit = JSON.parse(await boundedText(fetcher, `https://api.github.com/repos/${root}/commits/${encodeURIComponent(ref)}`, 512 * 1024, deadline))
      if (target.refPath) directory = candidates.slice(length).join('/')
      break
    } catch (error) {
      if ((error as Error).message !== 'builder_repository_not_public_or_missing' || length === 1) throw error
    }
  }
  if (!commit || !/^[a-f0-9]{40}$/i.test(commit.sha || '')) throw new Error('builder_repository_revision_invalid')
  let treeSha = commit.sha
  // Resolve each directory without asking GitHub for the entire recursive repository tree.
  for (const segment of directory.split('/').filter(Boolean)) {
    const parent = JSON.parse(await boundedText(fetcher, `https://api.github.com/repos/${root}/git/trees/${treeSha}`, 2 * 1024 * 1024, deadline))
    if (parent.truncated || !Array.isArray(parent.tree)) throw new Error('builder_repository_too_large')
    const child = parent.tree.find((item: { path: string; type: string }) => item.path === segment && item.type === 'tree')
    if (!child || !/^[a-f0-9]{40}$/i.test(child.sha || '')) throw new Error('builder_repository_no_source')
    treeSha = child.sha
  }
  const tree = JSON.parse(await boundedText(fetcher, `https://api.github.com/repos/${root}/git/trees/${treeSha}?recursive=1`, 2 * 1024 * 1024, deadline))
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('builder_repository_too_large')
  const prefix = directory ? `${directory}/` : ''
  const selected = tree.tree.filter((item: { path: string; type: string; mode: string }) => item.type === 'blob'
    && ['100644', '100755'].includes(item.mode) && allowedSource(item.path))
  if (!selected.length) throw new Error('builder_repository_no_source')
  if (selected.length > 100 || selected.reduce((sum: number, file: { size?: number }) => sum + Number(file.size || 0), 0) > 2 * 1024 * 1024) throw new Error('builder_repository_too_large')
  const files: { path: string; content: string }[] = []
  let total = 0
  for (let start = 0; start < selected.length; start += 5) {
    const batch = await Promise.all(selected.slice(start, start + 5).map(async (item: { path: string }) => {
      const path = builderFilePath(item.path)
      const content = await boundedText(fetcher, `https://raw.githubusercontent.com/${root}/${commit.sha}/${(prefix + path).split('/').map(encodeURIComponent).join('/')}`, 512 * 1024, deadline)
      if (content.includes('\0')) throw new Error('builder_repository_binary_file')
      return { path, content }
    }))
    total += batch.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0)
    if (total > 2 * 1024 * 1024) throw new Error('builder_repository_too_large')
    files.push(...batch)
  }
  return { files, repository: `${target.owner}/${target.repo}`, commitSha: commit.sha as string, directory }
}

export function builderRepositoryErrorReply(error: string): string {
  if (error === 'builder_repository_requires_empty_workspace') return 'Import into a new Builder workspace so existing files are preserved. Send the repository URL in a new Builder task without selecting an existing workspace.'
  if (error === 'builder_repository_too_large') return 'This repository exceeds the current import limit of 100 source files or 2 MiB. Send a GitHub tree URL for the relevant folder, or attach the failing source, manifest and tests.'
  if (error === 'builder_platform_repository_requires_owner_lane') return 'SignalBoost platform repository work belongs in the signed-in owner Assistant. This Builder workspace does not grant platform repository access.'
  if (error === 'builder_repository_not_public_or_missing') return 'I could not read that public repository. Check its URL; for a private repository, attach the relevant source, manifest and tests. No repository credentials are needed in chat.'
  return 'I could not import the repository source. Check the GitHub repository or folder URL, or attach the relevant files. No code was run.'
}
