// saas/lib/builder/repository-merge-watch.ts
//
// The half of auto-merge that was missing: after the merge, somebody has to look.
//
// attemptSignalBoostRepositoryAutoMerge captures a pre-merge deployment as the rollback
// target and then does nothing with it. A checkpoint nobody watches is not a safety
// mechanism, it is a note. This module watches the deployment the merge produced and
// restores the checkpoint when that deployment fails.
//
// THREE OUTCOMES, AND THE THIRD IS THE IMPORTANT ONE:
//
//   healthy      the merged commit reached READY. Nothing to do.
//   rolled_back  it reached ERROR or CANCELED, and the checkpoint was restored.
//   unresolved   the watch ran out of time, or the deployment never appeared, or the
//                restore itself failed. NOTHING IS ROLLED BACK ON UNRESOLVED.
//
// WHY UNKNOWN IS NEVER TREATED AS FAILURE. A Vercel rollback disables auto-assignment of
// production domains, so pushes stop going live until a human promotes a build. Rolling
// back because a build was merely slow would freeze the pipeline over a non-event, and the
// person who discovers it is whoever pushes next. A timeout means "a human should look",
// and the reply says exactly which deployment and which rollback target.
//
// THE HARD LIMIT ON THIS DESIGN, STATED PLAINLY. This runs inside the repair request, whose
// remaining budget after a merge is tens of seconds, while a production build commonly takes
// longer. So the honest expectation is that `unresolved` is a COMMON outcome, not a rare one.
// Making the watch reliable means moving it out of the request — a durable follow-up job or
// cron that re-checks the deployment minutes later. That is not built. Until it is, this
// narrows the window rather than closing it, and says so in its own result.

// Value import, so it must be relative with an extension: the '@/' alias is a bundler
// convenience and does not resolve under the repo's bare node test runner.
import { vercelRollbackAftermath } from '../supervisor/adapters/vercel-snapshot-host.ts'
import type { SnapshotScope, StateSnapshotPort, StateSnapshotRef } from '../portable/state-snapshot-port.ts'

const API = 'https://api.vercel.com'
const POLL_INTERVAL_MS = 5_000
// Less than two poll cycles is not a watch, it is a coin flip: refuse rather than pretend.
const MIN_USEFUL_WATCH_CYCLES = 2

export type MergeWatchOutcome = 'healthy' | 'rolled_back' | 'unresolved'

export type MergeWatchResult = Readonly<{
  outcome: MergeWatchOutcome
  /** The deployment produced by the merge, when one was found. */
  deploymentId: string | null
  deploymentState: string | null
  /** The checkpoint that was, or would have been, restored. */
  rollbackTargetId: string | null
  /** One sentence fit for the operator reply. Never empty. */
  detail: string
}>

type RequestLike = typeof fetch

function result(input: Partial<MergeWatchResult> & { outcome: MergeWatchOutcome; detail: string }): MergeWatchResult {
  return Object.freeze({ deploymentId: null, deploymentState: null, rollbackTargetId: null, ...input })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface DeploymentRow {
  uid?: string
  id?: string
  state?: string
  readyState?: string
  createdAt?: number
  meta?: Record<string, unknown>
}

function commitShaOf(row: DeploymentRow): string {
  const meta = row.meta || {}
  for (const key of ['githubCommitSha', 'gitlabCommitSha', 'bitbucketCommitSha']) {
    const value = meta[key]
    if (typeof value === 'string' && value) return value.toLowerCase()
  }
  return ''
}

/**
 * Rebuilt rather than threaded through, because the only field a restore keys on is the id
 * and the rest is recorded fact: it was a deployment, on Vercel, and it was restorable —
 * attemptSignalBoostRepositoryAutoMerge refuses the merge outright when it is not.
 */
function rollbackTarget(snapshotId: string): StateSnapshotRef {
  return Object.freeze({
    snapshotId,
    scope: 'deployment' as SnapshotScope,
    provider: 'vercel',
    capturedAt: new Date().toISOString(),
    restorable: true,
  })
}

/**
 * Watch the deployment a merge produced and roll back if it fails.
 *
 * Never throws: a watch that crashes must not turn a completed repair into a failed one,
 * so every fault becomes an `unresolved` result naming what a human should check.
 */
export async function watchMergedDeployment(input: {
  mergeCommitSha: string
  preMergeSnapshotId: string
  snapshotPort: StateSnapshotPort | null
  projectId: string
  teamId?: string
  token: string
  /** Absolute wall-clock cutoff. The watch never runs past it. */
  deadlineAtMs: number
  request?: RequestLike
  /** Injected for tests; production polls on the module default. */
  pollIntervalMs?: number
}): Promise<MergeWatchResult> {
  const pollIntervalMs = input.pollIntervalMs ?? POLL_INTERVAL_MS
  const remaining = input.deadlineAtMs - Date.now()
  if (remaining < pollIntervalMs * MIN_USEFUL_WATCH_CYCLES) {
    return result({
      outcome: 'unresolved',
      rollbackTargetId: input.preMergeSnapshotId,
      detail: `No time remained to watch the merged deployment. Check the deployment for commit ${input.mergeCommitSha}; if it failed, roll back to ${input.preMergeSnapshotId}.`,
    })
  }
  if (!input.token || !input.projectId) {
    return result({
      outcome: 'unresolved',
      rollbackTargetId: input.preMergeSnapshotId,
      detail: `Vercel credentials are not configured, so the merged deployment was not watched. Check the deployment for commit ${input.mergeCommitSha}; if it failed, roll back to ${input.preMergeSnapshotId}.`,
    })
  }

  const request = input.request ?? fetch
  const targetSha = String(input.mergeCommitSha || '').toLowerCase()
  const search = new URLSearchParams({ projectId: input.projectId, target: 'production', limit: '20' })
  if (input.teamId) search.set('teamId', input.teamId)
  const url = `${API}/v6/deployments?${search.toString()}`

  let found: DeploymentRow | null = null
  let lastState = ''

  try {
    while (Date.now() < input.deadlineAtMs) {
      const response = await request(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${input.token}`, Accept: 'application/json' },
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({})) as Record<string, any>
      const rows: DeploymentRow[] = Array.isArray(body?.deployments) ? body.deployments : []
      found = rows.find(row => commitShaOf(row) === targetSha) || null
      lastState = String(found?.readyState || found?.state || '').toUpperCase()

      if (lastState === 'READY') {
        return result({
          outcome: 'healthy',
          deploymentId: String(found?.uid || found?.id || '') || null,
          deploymentState: lastState,
          rollbackTargetId: input.preMergeSnapshotId,
          detail: `The merged commit deployed successfully. No rollback was needed.`,
        })
      }
      if (lastState === 'ERROR' || lastState === 'CANCELED') break

      const wait = Math.min(pollIntervalMs, input.deadlineAtMs - Date.now())
      if (wait <= 0) break
      await sleep(wait)
    }
  } catch (error) {
    return result({
      outcome: 'unresolved',
      rollbackTargetId: input.preMergeSnapshotId,
      detail: `Watching the merged deployment failed (${error instanceof Error ? error.message : 'unknown error'}). Check the deployment for commit ${targetSha}; if it failed, roll back to ${input.preMergeSnapshotId}.`,
    })
  }

  const deploymentId = String(found?.uid || found?.id || '') || null

  if (lastState !== 'ERROR' && lastState !== 'CANCELED') {
    return result({
      outcome: 'unresolved',
      deploymentId,
      deploymentState: lastState || null,
      rollbackTargetId: input.preMergeSnapshotId,
      detail: found
        ? `The merged deployment ${deploymentId} was still ${lastState || 'in progress'} when the watch window closed, so nothing was rolled back. If it fails, roll back to ${input.preMergeSnapshotId}.`
        : `No production deployment for commit ${targetSha} appeared before the watch window closed, so nothing was rolled back. If one appears and fails, roll back to ${input.preMergeSnapshotId}.`,
    })
  }

  // The merged deployment failed. This is the one case that restores.
  if (!input.snapshotPort) {
    return result({
      outcome: 'unresolved',
      deploymentId,
      deploymentState: lastState,
      rollbackTargetId: input.preMergeSnapshotId,
      detail: `The merged deployment ${deploymentId} reported ${lastState}, but no snapshot port is available to roll back with. Roll back to ${input.preMergeSnapshotId} manually.`,
    })
  }

  const restore = await Promise.resolve(input.snapshotPort.restore(rollbackTarget(input.preMergeSnapshotId)))
    .catch(error => ({ ok: false, error: error instanceof Error ? error.message : 'unknown error' }))

  if (!restore.ok) {
    return result({
      outcome: 'unresolved',
      deploymentId,
      deploymentState: lastState,
      rollbackTargetId: input.preMergeSnapshotId,
      detail: `The merged deployment ${deploymentId} reported ${lastState} and the automatic rollback FAILED (${restore.error || 'no detail'}). Production is still on the failed build. Roll back to ${input.preMergeSnapshotId} manually, now.`,
    })
  }

  return result({
    outcome: 'rolled_back',
    deploymentId,
    deploymentState: lastState,
    rollbackTargetId: input.preMergeSnapshotId,
    detail: `The merged deployment ${deploymentId} reported ${lastState}, so it was rolled back automatically. ${vercelRollbackAftermath(input.preMergeSnapshotId)}`,
  })
}
