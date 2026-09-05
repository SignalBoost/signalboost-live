// saas/lib/builder/repository-repair-automerge.ts
//
// The extension of publishSignalBoostRepositoryRepair that closes the loop: fix, verify,
// commit, merge — with the same admission test the Supervisor's repair envelope already
// uses, applied to a merge instead of an unattended repair.
//
// TWO INDEPENDENT REFUSALS, EITHER ONE IS FINAL:
//
//   1. DangerCategory (financial / credential_security) never auto-merges. No amount of
//      passing test evidence changes this — a diff can satisfy every test it was given
//      and still be wrong about money or access, and that is a human judgment call, full
//      stop, same rule as the Supervisor's rollback-coordinator.
//
//   2. No restorable snapshot, no auto-merge. Auto-merge is authorization to complete a
//      fix without a second human click ONLY because the action is checked as reversible
//      before it happens — the same admission test as lib/portable/repair-envelope.ts:
//      "a class may run pre-authorised only if the plan is classified BOUNDED." A merge
//      with nothing to roll back to if it is wrong is not that; it stays PR-only.
//
// This module never merges by itself when either refusal applies. It captures the
// pre-merge Vercel deployment id as the rollback reference, but does not restore it —
// automated post-merge failure detection and rollback is a separate, not-yet-built piece.

import type { StateSnapshotPort } from '@/lib/portable/state-snapshot-port'
import type { BuilderFile } from './contracts.ts'
import { repositoryChangeDangerCategory, repositoryChangeDangerReason, type RepositoryChangeDangerCategory } from './repository-change-danger-policy.ts'

const GITHUB_API = 'https://api.github.com/repos/SignalBoost/signalboost-live'
type RequestLike = typeof fetch
type JsonRecord = Record<string, any>

export type AutoMergeRefusalReason =
  | 'danger_category'
  | 'snapshot_capture_failed'
  | 'snapshot_not_restorable'

// Flat result shape, not a discriminated union: this repository builds with
// tsconfig strict:false, where unions do not narrow on a literal discriminant.
export type AutoMergeEligibility = Readonly<{
  eligible: boolean
  reason: AutoMergeRefusalReason | null
  dangerCategory: RepositoryChangeDangerCategory | null
  detail: string | null
}>

/**
 * The danger check alone, exposed separately so a caller can explain a PR-only outcome
 * before spending a snapshot-capture call.
 */
export function evaluateAutoMergeDangerCategory(
  files: readonly Pick<BuilderFile, 'path' | 'content'>[],
  patch: string,
): AutoMergeEligibility {
  const category = repositoryChangeDangerCategory(files, patch)
  if (category) {
    return Object.freeze({ eligible: false, reason: 'danger_category', dangerCategory: category, detail: repositoryChangeDangerReason(category) })
  }
  return Object.freeze({ eligible: true, reason: null, dangerCategory: null, detail: null })
}

export type AutoMergeResult = Readonly<{
  merged: boolean
  reason: AutoMergeRefusalReason | null
  detail: string | null
  dangerCategory: RepositoryChangeDangerCategory | null
  /** The deployment id captured before merge — the rollback target if the merge later proves wrong. */
  preMergeSnapshotId: string | null
  mergeCommitSha: string | null
}>

function refusal(reason: AutoMergeRefusalReason, detail: string, dangerCategory: RepositoryChangeDangerCategory | null = null): AutoMergeResult {
  return Object.freeze({ merged: false, reason, detail, dangerCategory, preMergeSnapshotId: null, mergeCommitSha: null })
}

async function requestJson(request: RequestLike, url: string, init: RequestInit, expected: readonly number[]): Promise<JsonRecord> {
  const response = await request(url, init)
  const payload = await response.json().catch(() => ({})) as JsonRecord
  if (!expected.includes(response.status)) {
    const detail = typeof payload?.message === 'string' ? payload.message.slice(0, 240) : `http_${response.status}`
    throw new Error(`builder_repository_automerge_${detail.replace(/\s+/g, '_').toLowerCase()}`)
  }
  return payload
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
    return refusal(dangerCheck.reason, dangerCheck.detail || '', dangerCheck.dangerCategory)
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
  if (!capture.ok) {
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

  try {
    const merge = await requestJson(
      request,
      `${GITHUB_API}/pulls/${input.pullRequestNumber}/merge`,
      { method: 'PUT', headers, body: JSON.stringify({ merge_method: 'squash' }) },
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
