// saas/lib/builder/merge-watch-runner.ts
//
// Decision logic for the builder merge watch cron. Storage is supplied through a port so
// the decisions can be tested without a database.

import type { MergeWatchStore, PendingMergeWatch } from './merge-watch-store'

export const MERGE_WATCH_MAX_ATTEMPTS = 3

export type MergeWatchOutcome = 'healthy' | 'rolled_back' | 'unresolved'

export interface MergeWatchSweep {
  claimed: number
  healthy: number
  rolledBack: number
  stillPending: number
  abandoned: number
}

export async function runPendingMergeWatches(input: {
  store: MergeWatchStore
  watch: (pending: PendingMergeWatch) => Promise<{ outcome: MergeWatchOutcome; detail?: string }>
}): Promise<MergeWatchSweep> {
  const rows = await input.store.claim(100, 60)
  const sweep: MergeWatchSweep = {
    claimed: rows.length,
    healthy: 0,
    rolledBack: 0,
    stillPending: 0,
    abandoned: 0,
  }

  for (const row of rows) {
    let outcome: MergeWatchOutcome = 'unresolved'
    let detail = ''
    try {
      const result = await input.watch(row)
      outcome = result.outcome
      detail = result.detail || ''
    } catch {
      outcome = 'unresolved'
    }

    if (outcome === 'healthy') {
      sweep.healthy += 1
      await input.store.close(row.id, 'healthy', detail)
    } else if (outcome === 'rolled_back') {
      sweep.rolledBack += 1
      await input.store.close(row.id, 'rolled_back', detail)
    } else if (row.attempts >= MERGE_WATCH_MAX_ATTEMPTS) {
      sweep.abandoned += 1
      await input.store.close(
        row.id,
        'abandoned',
        `rollback target ${row.preMergeSnapshotId} for merge ${row.mergeCommitSha}`,
      )
    } else {
      sweep.stillPending += 1
    }
  }

  return sweep
}
