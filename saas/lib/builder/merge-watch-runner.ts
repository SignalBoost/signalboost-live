// saas/lib/builder/merge-watch-runner.ts
//
// Decision logic for the builder merge watch cron. Storage is supplied through a port so
// the decisions can be tested without a database.

import type { MergeWatchStore, PendingMergeWatch } from './merge-watch-store.ts'

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
  watch: (pending: PendingMergeWatch) => Promise<{ outcome: MergeWatchOutcome; detail?: string; deploymentId?: string | null; deploymentState?: string | null }>
  onTerminal?: (pending: PendingMergeWatch, status: 'healthy' | 'rolled_back' | 'abandoned', detail: string, observed?: { deploymentId?: string | null; deploymentState?: string | null }) => Promise<void>
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
    let observed: { deploymentId?: string | null; deploymentState?: string | null } | undefined
    try {
      const result = await input.watch(row)
      outcome = result.outcome
      detail = result.detail || ''
      observed = { deploymentId: result.deploymentId ?? null, deploymentState: result.deploymentState ?? null }
    } catch {
      outcome = 'unresolved'
    }

    if (outcome === 'healthy') {
      sweep.healthy += 1
      await input.store.close(row.id, 'healthy', detail)
      await input.onTerminal?.(row, 'healthy', detail, observed)
    } else if (outcome === 'rolled_back') {
      sweep.rolledBack += 1
      await input.store.close(row.id, 'rolled_back', detail)
      await input.onTerminal?.(row, 'rolled_back', detail, observed)
    } else if (row.attempts >= MERGE_WATCH_MAX_ATTEMPTS) {
      sweep.abandoned += 1
      const abandonedDetail = `rollback target ${row.preMergeSnapshotId} for merge ${row.mergeCommitSha}`
      await input.store.close(row.id, 'abandoned', abandonedDetail)
      await input.onTerminal?.(row, 'abandoned', abandonedDetail, observed)
    } else {
      sweep.stillPending += 1
    }
  }

  return sweep
}
