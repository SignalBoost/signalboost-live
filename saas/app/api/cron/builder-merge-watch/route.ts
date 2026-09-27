// saas/app/api/cron/builder-merge-watch/route.ts
//
// Finishes what the in-request watch could not. A repair job that auto-merged and ran out of
// budget before the deployment resolved leaves a row in builder_merge_watches; this re-checks
// it every minute until it is READY, failed and rolled back, or the attempt budget is spent.
//
// Accepts no request-supplied work. Every input comes from a row written by an already
// authorized repair, and the only action available is rollback to the deployment that row
// recorded before its own merge.

import { NextResponse } from 'next/server'
import { createSupabaseMergeWatchStore } from '@/lib/builder/merge-watch-store'
import { runPendingMergeWatches } from '@/lib/builder/merge-watch-runner'
import { watchMergedDeployment } from '@/lib/builder/repository-merge-watch'
import { builderAutoMergeSnapshotPort } from '@/lib/builder/repository-repair-snapshot-host'
import { acceptBuilderProductionRepair } from '@/lib/builder/repository-production-acceptance'
import {
  completeBuilderRepositoryRepairAfterMerge,
  failBuilderRepositoryRepairAfterMergedDeployment,
} from '@/lib/builder/repository-repair-job-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const store = createSupabaseMergeWatchStore()
  if (!store) return NextResponse.json({ ok: false, error: 'builder_merge_watch_storage_unavailable' }, { status: 503 })

  try {
    const sweep = await runPendingMergeWatches({
      store,
      watch: pending => watchMergedDeployment({
        mergeCommitSha: pending.mergeCommitSha,
        preMergeSnapshotId: pending.preMergeSnapshotId,
        snapshotPort: builderAutoMergeSnapshotPort(),
        projectId: process.env.VERCEL_PROJECT_ID || '',
        teamId: process.env.VERCEL_TEAM_ID || undefined,
        token: process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '',
        // One poll per tick. The cron is the retry loop, so this call does not sit and wait.
        deadlineAtMs: Date.now() + 12_000,
        pollIntervalMs: 5_000,
      }),
      onTerminal: async (pending, status, detail, observed) => {
        if (!pending.pullRequestNumber) return
        if (status === 'healthy') {
          if (!pending.acceptanceUrl || !pending.acceptanceExpectedText) {
            // A generic homepage smoke test cannot prove a specific repair. Keep the durable
            // watch open until the originating job supplies a task-specific acceptance contract.
            return 'retry'
          }
          const snapshotPort = builderAutoMergeSnapshotPort()
          const acceptance = await acceptBuilderProductionRepair({
            preMergeSnapshotId: pending.preMergeSnapshotId,
            snapshotPort,
            targetUrl: pending.acceptanceUrl || undefined,
            expectedText: pending.acceptanceExpectedText || undefined,
          })
          if (acceptance.outcome === 'accepted') {
            await completeBuilderRepositoryRepairAfterMerge({
              pullRequestNumber: pending.pullRequestNumber,
              mergeCommitSha: pending.mergeCommitSha,
              baseBranch: 'main',
              detail: `${detail} ${acceptance.detail}`,
              mergeWatchOutcome: 'healthy',
              deploymentId: observed?.deploymentId ?? null,
              deploymentState: observed?.deploymentState ?? null,
              preMergeSnapshotId: pending.preMergeSnapshotId,
              productionAcceptancePassed: true,
            })
            return 'complete'
          }
          if (acceptance.outcome === 'unresolved') return 'retry'
          await failBuilderRepositoryRepairAfterMergedDeployment({
            pullRequestNumber: pending.pullRequestNumber,
            mergeCommitSha: pending.mergeCommitSha,
            detail: acceptance.detail,
            error: acceptance.outcome === 'rolled_back'
              ? 'builder_repository_production_rolled_back'
              : 'builder_repository_production_unresolved',
          })
          return 'complete'
        }
        await failBuilderRepositoryRepairAfterMergedDeployment({
          pullRequestNumber: pending.pullRequestNumber,
          mergeCommitSha: pending.mergeCommitSha,
          detail,
          error: status === 'rolled_back'
            ? 'builder_repository_production_rolled_back'
            : 'builder_repository_production_unresolved',
        })
        return 'complete'
      },
    })
    return NextResponse.json({ ok: true, ...sweep })
  } catch (error) {
    console.error('[builder_merge_watch_sweep_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ ok: false, error: 'builder_merge_watch_sweep_failed' }, { status: 500 })
  }
}
