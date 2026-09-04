import {
  resolveSignalBoostRepositoryCommit,
  type SignalBoostRepositoryRepairTarget,
} from './repository-repair-target.ts'

export type SignalBoostRepositoryRepairFreshness = Readonly<{
  status: 'current' | 'superseded' | 'unverifiable'
  target: SignalBoostRepositoryRepairTarget
  reportedCommitSha: string
  currentBranchHeadSha: string | null
  reason: 'matches_current_branch_head' | 'branch_advanced' | 'target_revision_unavailable' | 'branch_head_unavailable'
}>

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SignalBoost-COS-Builder',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = String(process.env.GITHUB_TOKEN || '').trim()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function unverifiable(
  target: SignalBoostRepositoryRepairTarget,
  reason: 'target_revision_unavailable' | 'branch_head_unavailable',
): SignalBoostRepositoryRepairFreshness {
  return Object.freeze({
    status: 'unverifiable',
    target,
    reportedCommitSha: target.fullCommitSha || target.commitSha,
    currentBranchHeadSha: null,
    reason,
  })
}

/**
 * Fail-closed freshness preflight for owner-authorized Platform Engineer work.
 * A pasted Vercel/GitHub failure may name a real immutable commit, but COS must not spend a repair
 * job on that snapshot after its branch has advanced. The branch head is read immediately before
 * enqueue; stale, deleted, or unverifiable targets launch no Builder job.
 */
export async function verifySignalBoostRepositoryRepairTargetCurrent(
  target: SignalBoostRepositoryRepairTarget,
  request: typeof fetch = fetch,
): Promise<SignalBoostRepositoryRepairFreshness> {
  let resolved: SignalBoostRepositoryRepairTarget
  try {
    resolved = await resolveSignalBoostRepositoryCommit(target, request)
  } catch {
    return unverifiable(target, 'target_revision_unavailable')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const branchRef = resolved.branch
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/')
    const response = await request(
      `https://api.github.com/repos/SignalBoost/signalboost-live/git/ref/heads/${branchRef}`,
      { headers: githubHeaders(), signal: controller.signal },
    )
    if (!response.ok) return unverifiable(resolved, 'branch_head_unavailable')

    const payload = await response.json().catch(() => null) as { object?: { sha?: unknown } } | null
    const currentBranchHeadSha = typeof payload?.object?.sha === 'string'
      ? payload.object.sha.toLowerCase()
      : ''
    const reportedCommitSha = String(resolved.fullCommitSha || '').toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(currentBranchHeadSha) || !/^[0-9a-f]{40}$/.test(reportedCommitSha)) {
      return unverifiable(resolved, 'branch_head_unavailable')
    }

    if (currentBranchHeadSha === reportedCommitSha) {
      return Object.freeze({
        status: 'current',
        target: resolved,
        reportedCommitSha,
        currentBranchHeadSha,
        reason: 'matches_current_branch_head',
      })
    }

    return Object.freeze({
      status: 'superseded',
      target: resolved,
      reportedCommitSha,
      currentBranchHeadSha,
      reason: 'branch_advanced',
    })
  } catch {
    return unverifiable(resolved, 'branch_head_unavailable')
  } finally {
    clearTimeout(timer)
  }
}
