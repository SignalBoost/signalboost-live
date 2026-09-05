// saas/lib/builder/merge-watch-runner.ts
//
// The decision half of the durable post-merge watch, with every dependency injected so the
// decisions can be tested. One of them rolls production back; none of them should first be
// exercised in production.
//
// WHAT EACH OUTCOME MEANS HERE:
//
//   healthy      the merged deployment reached READY. Row closed, nothing done.
//   rolled_back  it failed and the checkpoint was restored. Row closed.
//   unresolved   still building, or the check itself failed. THE ROW STAYS PENDING and the
//                next tick tries again — this is the whole reason the table exists.
//   abandoned    the attempt budget ran out with the deployment still unresolved. Closed with
//                the rollback target named, because a watch that quietly stops watching is
//                worse than one that never started.
//
// The attempt budget is the honest limit: after it, a human owns the outcome, and the detail
// says which deployment and which build to roll back to.

import type { MergeWatchStore, PendingMergeWatch } from './merge-watch-store.ts'
import type { MergeWatchResult } from './repository-merge-watch.ts'

/** Matches the attempts ceiling in the migration. */
export const MERGE_WATCH_MAX_ATTEMPTS = 10

export type MergeWatchSweep = Readonly<{
  claimed: number
  healthy: number
  rolledBack: number
  abandoned: number
  stillPending: number
}>

type WatchFn = (input: PendingMergeWatch) => Promise<MergeWatchResult>

/**
 * Run one sweep of due watches. Never throws for a single row's sake: one merge that cannot be
 * judged must not stop the others from being judged.
 */
export async function runPendingMergeWatches(input: {
  store: MergeWatchStore
  watch: WatchFn
  limit?: number
  backoffSeconds?: number
}): Promise<MergeWatchSweep> {
  const rows = await input.store.claim(input.limit ?? 3, input.backoffSeconds ?? 60)
  let healthy = 0
  let rolledBack = 0
  let abandoned = 0
  let stillPending = 0

  for (const pending of rows) {
    let outcome: MergeWatchResult
    try {
      outcome = await input.watch(pending)
    } catch (error) {
      outcome = {
        outcome: 'unresolved',
        deploymentId: null,
        deploymentState: null,
        rollbackTargetId: pending.preMergeSnapshotId,
        detail: `The check failed (${error instanceof Error ? error.message : 'unknown error'}).`,
      }
    }

    if (outcome.outcome === 'healthy') {
      healthy += 1
      await input.store.close(pending.id, 'healthy', outcome.detail).catch(() => {})
      continue
    }
    if (outcome.outcome === 'rolled_back') {
      rolledBack += 1
      await input.store.close(pending.id, 'rolled_back', outcome.detail).catch(() => {})
      continue
    }

    // Unresolved. Leave it pending unless the budget is spent.
    if (pending.attempts >= MERGE_WATCH_MAX_ATTEMPTS) {
      abandoned += 1
      await input.store.close(
        pending.id,
        'abandoned',
        `Gave up after ${pending.attempts} checks without a verdict. ${outcome.detail} Roll back to ${pending.preMergeSnapshotId} manually if the deployment for ${pending.mergeCommitSha} failed.`,
      ).catch(() => {})
      continue
    }
    stillPending += 1
  }

  return Object.freeze({ claimed: rows.length, healthy, rolledBack, abandoned, stillPending })
}
