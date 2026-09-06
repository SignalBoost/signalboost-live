// saas/lib/builder/repository-repair-automerge.ts
//
// AUTO-MERGE OF AN ALREADY-VERIFIED REPAIR PULL REQUEST.
//
// This file never opens a PR, never writes source, and never deploys. It answers exactly
// one question: given a PR that publishSignalBoostRepositoryRepair already created from a
// pinned commit, may the agent press merge unattended? Every gate below is a reason to
// refuse; a refusal costs nothing, because the PR simply stays open for human review.
//
// The gates, in order — each one is cheaper and safer than the one after it:
//   1. danger category   — billing/credential changes never auto-merge, tests or no tests.
//   2. checkpoint        — no restorable pre-merge snapshot, no pre-authorized merge.
//   3. write credential  — absent means this lane was never configured to write at all.
//   4. green checks      — absence of evidence is not evidence the project still builds.
import type { BuilderFile } from './contracts.ts'
import type { StateSnapshotPort } from '../portable/state-snapshot-port.ts'
import {
  repositoryChangeDangerCategory,
  repositoryChangeDangerReason,
  type RepositoryChangeDangerCategory,
} from './repository-change-danger-policy.ts'

const GITHUB_API = 'https://api.github.com/repos/SignalBoost/signalboost-live'

type RequestLike = typeof fetch
type JsonRecord = Record<string, any>

export type AutoMergeRefusalReason =
  | 'danger_category'
  | 'snapshot_capture_failed'
  | 'snapshot_not_restorable'
  | 'checks_not_green'

export type AutoMergeResult = Readonly<{
  merged: boolean
  reason: AutoMergeRefusalReason | null
  detail: string | null
  dangerCategory: RepositoryChangeDangerCategory | null
  preMergeSnapshotId: string | null
  mergeCommitSha: string | null
}>

export type AutoMergeDangerVerdict = Readonly<{
  eligible: boolean
  reason: AutoMergeRefusalReason | null
  detail: string | null
  dangerCategory: RepositoryChangeDangerCategory | null
}>

function refusal(
  reason: AutoMergeRefusalReason,
  detail: string,
  dangerCategory: RepositoryChangeDangerCategory | null = null,
): AutoMergeResult {
  return Object.freeze({
    merged: false,
    reason,
    detail: detail || null,
    dangerCategory,
    preMergeSnapshotId: null,
    mergeCommitSha: null,
  })
}

async function requestJson(
  request: RequestLike,
  url: string,
  init: RequestInit,
  expected: readonly number[],
): Promise<JsonRecord> {
  const response = await request(url, init)
  const payload = await response.json().catch(() => ({})) as JsonRecord
  if (!expected.includes(response.status)) {
    const detail = typeof payload?.message === 'string' ? payload.message.slice(0, 240) : `http_${response.status}`
    throw new Error(`builder_repository_automerge_${detail.replace(/\s+/g, '_').toLowerCase()}`)
  }
  return payload
}

/**
 * Default-deny classification of the change itself, decided before any port or network call
 * so a dangerous diff never even causes a checkpoint to be taken. Exported because the same
 * verdict is worth asserting directly in tests and reusable by any caller that wants to know
 * whether a change is auto-mergeable before it starts the publish work.
 */
export function evaluateAutoMergeDangerCategory(
  files: readonly Pick<BuilderFile, 'path' | 'content'>[],
  patch: string,
): AutoMergeDangerVerdict {
  const dangerCategory = repositoryChangeDangerCategory(files, patch)
  if (!dangerCategory) {
    return Object.freeze({ eligible: true, reason: null, detail: null, dangerCategory: null })
  }
  return Object.freeze({
    eligible: false,
    reason: 'danger_category' as const,
    detail: repositoryChangeDangerReason(dangerCategory),
    dangerCategory,
  })
}

/**
 * Read the pull request's head commit and judge its check runs and commit statuses.
 *
 * Green means: at least one check exists, every completed run concluded success or neutral,
 * and nothing is still queued or in progress. NO CHECKS IS NOT GREEN — an unchecked head is
 * an absence of evidence, and this gate exists precisely to stop absence being read as proof.
 * Skipped runs count as green; a skipped job asserts nothing about the build either way, and
 * treating conditional workflows as failures would block every merge on this repository.
 */
export async function evaluatePullRequestChecks(
  request: RequestLike,
  headers: Record<string, string>,
  pullRequestNumber: number,
): Promise<{ green: boolean; detail: string }> {
  const pull = await requestJson(request, `${GITHUB_API}/pulls/${pullRequestNumber}`, { method: 'GET', headers }, [200])
  const headSha = String(pull?.head?.sha || '')
  if (!/^[0-9a-f]{40}$/i.test(headSha)) {
    return { green: false, detail: 'The pull request head commit could not be identified, so its checks could not be judged.' }
  }

  const runs = await requestJson(request, `${GITHUB_API}/commits/${headSha}/check-runs?per_page=100`, { method: 'GET', headers }, [200])
  const status = await requestJson(request, `${GITHUB_API}/commits/${headSha}/status`, { method: 'GET', headers }, [200])

  const checkRuns = Array.isArray(runs?.check_runs) ? runs.check_runs : []
  const statuses = Array.isArray(status?.statuses) ? status.statuses : []
  if (!checkRuns.length && !statuses.length) {
    return { green: false, detail: `No checks have reported on ${headSha.slice(0, 7)}, so there is no evidence the project still builds.` }
  }

  const pending = checkRuns
    .filter((run: any) => String(run?.status || '') !== 'completed')
    .map((run: any) => String(run?.name || 'unnamed'))
  const failed = checkRuns
    .filter((run: any) => String(run?.status || '') === 'completed'
      && !['success', 'neutral', 'skipped'].includes(String(run?.conclusion || '')))
    .map((run: any) => `${run?.name || 'unnamed'} (${run?.conclusion || 'no conclusion'})`)

  const combined = String(status?.state || '')
  if (combined === 'pending' && statuses.length) pending.push('commit status: pending')
  if (combined === 'failure' || combined === 'error') failed.push(`commit status: ${combined}`)

  if (failed.length) {
    return { green: false, detail: `The pull request checks failed on ${headSha.slice(0, 7)}: ${failed.slice(0, 6).join(', ')}.` }
  }
  if (pending.length) {
    return { green: false, detail: `The pull request checks on ${headSha.slice(0, 7)} have not finished: ${pending.slice(0, 6).join(', ')}.` }
  }
  return { green: true, detail: `All checks passed on ${headSha.slice(0, 7)}.` }
}

/**
 * Attempt to auto-merge an already-opened, already-verified repair PR. Called only after
 * publishSignalBoostRepositoryRepair has returned a real pullRequestNumber — this function
 * never opens a PR itself and never touches source; it only decides whether to press merge.
 */
export async function attemptSignalBoostRepositoryAutoMerge(input: {
  files: readonly Pick<BuilderFile, 'path' | 'content'>[]
  patch: string
  pullRequestNumber: number
  snapshotPort: StateSnapshotPort | null
  /** Passed through to StateSnapshotPort.capture(). Defaults describe this exact call site. */
  captureContext?: { scope: 'deployment'; provider: string; environment: string; reason: string }
  request?: RequestLike
  token?: string
}): Promise<AutoMergeResult> {
  const dangerCheck = evaluateAutoMergeDangerCategory(input.files, input.patch)
  if (!dangerCheck.eligible) {
    return refusal(dangerCheck.reason ?? 'danger_category', dangerCheck.detail || '', dangerCheck.dangerCategory)
  }

  if (!input.snapshotPort) {
    return refusal('snapshot_capture_failed', 'No snapshot port is configured. No checkpoint, no pre-authorized merge.')
  }

  const capture = await input.snapshotPort.capture(input.captureContext ?? {
    scope: 'deployment',
    provider: 'vercel',
    environment: 'production',
    reason: 'Pre-merge checkpoint before COS Platform Engineer auto-merge',
  })
  if (!capture.ok || !capture.snapshot) {
    return refusal('snapshot_capture_failed', capture.error || 'Snapshot capture failed for an unspecified reason.')
  }
  if (!capture.snapshot.restorable) {
    return refusal(
      'snapshot_not_restorable',
      `A checkpoint (${capture.snapshot.snapshotId}) was captured but is not restorable under current configuration, so the merge would be unrecoverable if it proves wrong. Merge manually, or enable restore, then retry.`,
    )
  }

  const token = String(input.token ?? process.env.GITHUB_WRITE_TOKEN ?? '').trim()
  if (!token) {
    return refusal('snapshot_capture_failed', 'builder_repository_write_not_configured')
  }
  const request = input.request ?? fetch
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'SignalBoost-COS-Platform-Engineer',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  const checks = await evaluatePullRequestChecks(request, headers, input.pullRequestNumber)
    .catch(error => ({ green: false, detail: `The pull request checks could not be read (${error instanceof Error ? error.message : 'unknown error'}).` }))
  if (!checks.green) {
    return refusal('checks_not_green', `${checks.detail} The pull request remains open; merge it once its checks pass.`)
  }

  try {
    const merge = await requestJson(
      request,
      `${GITHUB_API}/pulls/${input.pullRequestNumber}/merge`,
      // Main Write Discipline requires a two-parent GitHub merge commit. Squash/rebase writes are
      // integration violations because they erase the PR parent and bypass the serialized path.
      { method: 'PUT', headers, body: JSON.stringify({ merge_method: 'merge' }) },
      [200],
    )
    const mergeCommitSha = String(merge?.sha || '')
    return Object.freeze({
      merged: true,
      reason: null,
      detail: null,
      dangerCategory: null,
      preMergeSnapshotId: capture.snapshot.snapshotId,
      mergeCommitSha: mergeCommitSha || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_repository_automerge_failed'
    return refusal('snapshot_capture_failed', message)
  }
}
