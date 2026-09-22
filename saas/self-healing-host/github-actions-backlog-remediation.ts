// Out-of-band GitHub Actions backlog remediation for the production Self-Healing Supervisor.
// Runs from Vercel, never from GitHub Actions, so it can recover the Actions control plane
// when hosted runners are saturated or a billing/queue incident prevents the in-Actions cleaner.

export const GITHUB_ACTIONS_BACKLOG_REMEDIATION_VERSION = 'github-actions-backlog-remediation-v1' as const

type Environment = Readonly<Record<string, string | undefined>>

type WorkflowRun = {
  id?: number
  name?: string
  head_branch?: string | null
  head_sha?: string | null
  status?: string | null
  conclusion?: string | null
  created_at?: string | null
  updated_at?: string | null
  pull_requests?: unknown[]
}

type Pull = {
  head?: { ref?: string | null; sha?: string | null }
}

export type GitHubActionsBacklogRemediationResult = {
  ok: boolean
  schemaVersion: typeof GITHUB_ACTIONS_BACKLOG_REMEDIATION_VERSION
  mode: 'disabled' | 'missing_credential' | 'active'
  scanned: number
  eligible: number
  cancelled: number
  purged: number
  preserved: number
  raced: number
  errors: number
}

const API = 'https://api.github.com'
const EPHEMERAL_BRANCH = /^(?:fix|feat|ci|mcp|ops|chore|test|hotfix|repair|refactor|ai|codex)\//
const PATCH_BRANCH = /^SignalBoost\/patch-/

function repoFrom(env: Environment): string {
  const explicit = String(env.GITHUB_REPOSITORY || '').trim()
  if (/^[^/\s]+\/[^/\s]+$/.test(explicit)) return explicit
  const owner = String(env.GITHUB_DEFAULT_OWNER || 'SignalBoost').trim()
  const repo = String(env.GITHUB_DEFAULT_REPO || 'signalboost-live').trim()
  if (!owner || !repo || owner.includes('/') || repo.includes('/')) throw new Error('github_actions_backlog_repository_invalid')
  return `${owner}/${repo}`
}

function tokenFrom(env: Environment): string {
  return String(env.GITHUB_WRITE_TOKEN || '').trim()
}

function isEphemeral(branch: string): boolean {
  return EPHEMERAL_BRANCH.test(branch) || PATCH_BRANCH.test(branch)
}

function createdAtMs(run: WorkflowRun): number {
  const value = Date.parse(String(run.created_at || ''))
  return Number.isFinite(value) ? value : 0
}

async function githubApi(
  token: string,
  path: string,
  options: RequestInit,
  fetcher: typeof fetch,
): Promise<any> {
  const response = await fetcher(`${API}${path}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2026-03-10',
      'user-agent': 'SignalBoost-Self-Healing/1.0',
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })

  if (response.status === 204 || response.status === 202) return null
  const raw = await response.text()
  if (!response.ok) {
    const error = new Error(`github_api_${response.status}:${raw.replace(/\s+/g, ' ').slice(0, 240)}`)
    ;(error as any).status = response.status
    throw error
  }
  if (!raw.trim()) return null
  try { return JSON.parse(raw) } catch { throw new Error('github_api_invalid_json') }
}

async function listPaged(
  token: string,
  pathForPage: (page: number) => string,
  fetcher: typeof fetch,
  maxPages: number,
): Promise<any[]> {
  const all: any[] = []
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await githubApi(token, pathForPage(page), { method: 'GET' }, fetcher)
    const rows = Array.isArray(data?.workflow_runs) ? data.workflow_runs : Array.isArray(data) ? data : []
    all.push(...rows)
    if (rows.length < 100) break
  }
  return all
}

async function branchTip(
  repository: string,
  branch: string,
  token: string,
  fetcher: typeof fetch,
): Promise<string | null> {
  try {
    const ref = await githubApi(
      token,
      `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
      { method: 'GET' },
      fetcher,
    )
    const sha = String(ref?.object?.sha || '').trim()
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : null
  } catch (error) {
    if ((error as any)?.status === 404) return null
    throw error
  }
}

export async function runGitHubActionsBacklogRemediation(input: {
  env?: Environment
  fetcher?: typeof fetch
  nowMs?: number
  minAgeMs?: number
  maxCancels?: number
} = {}): Promise<GitHubActionsBacklogRemediationResult> {
  const env = input.env ?? process.env
  const fetcher = input.fetcher ?? fetch
  const base = {
    schemaVersion: GITHUB_ACTIONS_BACKLOG_REMEDIATION_VERSION,
    scanned: 0,
    eligible: 0,
    cancelled: 0,
    purged: 0,
    preserved: 0,
    raced: 0,
    errors: 0,
  }

  if (String(env.SELF_HEALING_GITHUB_ACTIONS_BACKLOG_ENABLED || 'true').trim().toLowerCase() === 'false') {
    return { ...base, ok: true, mode: 'disabled' }
  }

  const token = tokenFrom(env)
  if (!token) return { ...base, ok: false, mode: 'missing_credential' }

  const repository = repoFrom(env)
  const nowMs = input.nowMs ?? Date.now()
  const minAgeMs = Math.max(60_000, input.minAgeMs ?? 10 * 60_000)
  const maxCancels = Math.min(100, Math.max(1, input.maxCancels ?? 80))

  const mainRef = await githubApi(token, `/repos/${repository}/git/ref/heads/main`, { method: 'GET' }, fetcher)
  const mainSha = String(mainRef?.object?.sha || '').trim()
  if (!/^[0-9a-f]{40}$/i.test(mainSha)) throw new Error('github_actions_backlog_main_sha_unavailable')

  const [queued, inProgress, pulls] = await Promise.all([
    listPaged(token, page => `/repos/${repository}/actions/runs?status=queued&per_page=100&page=${page}`, fetcher, 5),
    listPaged(token, page => `/repos/${repository}/actions/runs?status=in_progress&per_page=100&page=${page}`, fetcher, 5),
    listPaged(token, page => `/repos/${repository}/pulls?state=open&per_page=100&page=${page}`, fetcher, 3),
  ])

  const openPrTips = new Map<string, string>()
  for (const pull of pulls as Pull[]) {
    const branch = String(pull?.head?.ref || '').trim()
    const sha = String(pull?.head?.sha || '').trim()
    if (branch && /^[0-9a-f]{40}$/i.test(sha)) openPrTips.set(branch, sha)
  }

  const runs = [...new Map(
    [...queued, ...inProgress]
      .map((run: WorkflowRun) => [Number(run.id), run] as const)
      .filter(([id]) => Number.isSafeInteger(id) && id > 0),
  ).values()]

  const branchTipCache = new Map<string, string | null>()
  const getTip = async (branch: string) => {
    if (branchTipCache.has(branch)) return branchTipCache.get(branch) ?? null
    const tip = await branchTip(repository, branch, token, fetcher)
    branchTipCache.set(branch, tip)
    return tip
  }

  const candidates: Array<{ id: number; reason: string; run: WorkflowRun }> = []
  let preserved = 0

  for (const run of runs as WorkflowRun[]) {
    const id = Number(run.id)
    const branch = String(run.head_branch || '').trim()
    const sha = String(run.head_sha || '').trim()
    const ageMs = nowMs - createdAtMs(run)

    if (!branch || !/^[0-9a-f]{40}$/i.test(sha) || ageMs < minAgeMs) {
      preserved += 1
      continue
    }
    if (sha === mainSha) {
      preserved += 1
      continue
    }
    if (branch === 'main') {
      candidates.push({ id, reason: 'stale_main_revision', run })
      continue
    }

    const openTip = openPrTips.get(branch)
    if (openTip) {
      if (openTip === sha) preserved += 1
      else candidates.push({ id, reason: 'superseded_open_pr_revision', run })
      continue
    }

    const tip = await getTip(branch)
    if (!tip) {
      candidates.push({ id, reason: 'deleted_branch', run })
      continue
    }
    if (tip !== sha) {
      candidates.push({ id, reason: 'superseded_branch_revision', run })
      continue
    }
    if (isEphemeral(branch)) {
      candidates.push({ id, reason: 'closed_or_unsubmitted_ephemeral_branch', run })
      continue
    }
    preserved += 1
  }

  const selected = candidates.slice(0, maxCancels)
  let cancelled = 0
  let purged = 0
  let raced = 0
  let errors = 0

  const ghostQueuedRun = (run: WorkflowRun): boolean => {
    const created = createdAtMs(run)
    const updated = Date.parse(String(run.updated_at || ''))
    return String(run.status || '') === 'queued'
      && run.conclusion == null
      && Array.isArray(run.pull_requests)
      && run.pull_requests.length === 0
      && created > 0
      && Number.isFinite(updated)
      && nowMs - created >= 24 * 60 * 60_000
      && Math.abs(updated - created) <= 60_000
  }

  for (let offset = 0; offset < selected.length; offset += 8) {
    const batch = selected.slice(offset, offset + 8)
    const results = await Promise.all(batch.map(async item => {
      try {
        await githubApi(token, `/repos/${repository}/actions/runs/${item.id}/cancel`, { method: 'POST' }, fetcher)
        return 'cancelled' as const
      } catch (error) {
        if ((error as any)?.status !== 409) return 'error' as const
        try {
          await githubApi(token, `/repos/${repository}/actions/runs/${item.id}/force-cancel`, { method: 'POST' }, fetcher)
          return 'cancelled' as const
        } catch (forceError) {
          if ((forceError as any)?.status !== 409) return 'error' as const
          if (!ghostQueuedRun(item.run)) return 'raced' as const
          try {
            const jobs = await githubApi(
              token,
              `/repos/${repository}/actions/runs/${item.id}/jobs?per_page=1`,
              { method: 'GET' },
              fetcher,
            )
            const totalJobs = Number(jobs?.total_count)
            const listedJobs = Array.isArray(jobs?.jobs) ? jobs.jobs.length : -1
            if (totalJobs !== 0 || listedJobs !== 0) return 'raced' as const
            await githubApi(token, `/repos/${repository}/actions/runs/${item.id}`, { method: 'DELETE' }, fetcher)
            return 'purged' as const
          } catch (purgeError) {
            if ((purgeError as any)?.status === 409) return 'raced' as const
            return 'error' as const
          }
        }
      }
    }))
    for (const result of results) {
      if (result === 'cancelled') cancelled += 1
      else if (result === 'purged') purged += 1
      else if (result === 'raced') raced += 1
      else errors += 1
    }
  }

  console.info('[github-actions-backlog-remediation]', {
    repository,
    scanned: runs.length,
    eligible: candidates.length,
    attempted: selected.length,
    cancelled,
    purged,
    preserved,
    raced,
    errors,
  })

  return {
    ...base,
    ok: errors === 0,
    mode: 'active',
    scanned: runs.length,
    eligible: candidates.length,
    cancelled,
    purged,
    preserved,
    raced,
    errors,
  }
}
