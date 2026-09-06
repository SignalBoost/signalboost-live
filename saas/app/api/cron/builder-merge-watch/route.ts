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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    })
    return NextResponse.json({ ok: true, ...sweep })
  } catch (error) {
    console.error('[builder_merge_watch_sweep_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ ok: false, error: 'builder_merge_watch_sweep_failed' }, { status: 500 })
  }
}
