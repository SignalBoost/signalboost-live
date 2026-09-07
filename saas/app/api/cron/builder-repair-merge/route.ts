import { NextResponse } from 'next/server'
import { completePendingRepositoryRepairMerges } from '@/lib/builder/repository-repair-merge-continuation'
import { builderAutoMergeSnapshotPort } from '@/lib/builder/repository-repair-snapshot-host'
import { completeBuilderRepositoryRepairAfterMerge } from '@/lib/builder/repository-repair-job-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await completePendingRepositoryRepairMerges({
    snapshotPort: builderAutoMergeSnapshotPort(),
    deadlineAtMs: Date.now() + 260_000,
  })
  let builderJobsCompleted = 0
  for (const outcome of result.outcomes) {
    if (outcome.outcome !== 'merged' || !outcome.mergeCommitSha) continue
    const completed = await completeBuilderRepositoryRepairAfterMerge({
      pullRequestNumber: outcome.pullRequestNumber,
      mergeCommitSha: outcome.mergeCommitSha,
      detail: outcome.detail,
    }).catch(error => {
      console.error('[builder_repository_merge_job_reconcile_failed]', {
        pullRequestNumber: outcome.pullRequestNumber,
        message: error instanceof Error ? error.message : 'unknown',
      })
      return false
    })
    if (completed) builderJobsCompleted += 1
  }
  return NextResponse.json({ ...result, builderJobsCompleted }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
