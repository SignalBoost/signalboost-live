import { NextResponse } from 'next/server'
import { completePendingRepositoryRepairMerges } from '@/lib/builder/repository-repair-merge-continuation'
import { builderAutoMergeSnapshotPort } from '@/lib/builder/repository-repair-snapshot-host'
import { acceptBuilderProductionRepair } from '@/lib/builder/repository-production-acceptance'
import {
  completeBuilderRepositoryRepairAfterMerge,
  failBuilderRepositoryRepairAfterMergedDeployment,
  failBuilderRepositoryRepairAfterSupersededBase,
} from '@/lib/builder/repository-repair-job-lifecycle'

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
  let builderJobsFailed = 0
  for (const outcome of result.outcomes) {
    if (outcome.outcome === 'merged' && outcome.mergeCommitSha) {
      if (outcome.baseBranch === 'main' && outcome.mergeWatchOutcome === 'rolled_back') {
        const failed = await failBuilderRepositoryRepairAfterMergedDeployment({
          pullRequestNumber: outcome.pullRequestNumber,
          mergeCommitSha: outcome.mergeCommitSha,
          detail: outcome.detail,
          error: 'builder_repository_production_rolled_back',
        }).catch(error => {
          console.error('[builder_repository_merge_job_reconcile_failed]', {
            pullRequestNumber: outcome.pullRequestNumber,
            message: error instanceof Error ? error.message : 'unknown',
          })
          return false
        })
        if (failed) builderJobsFailed += 1
        continue
      }
      let productionAcceptancePassed = false
      if (outcome.baseBranch === 'main' && outcome.mergeWatchOutcome === 'healthy') {
        const acceptance = await acceptBuilderProductionRepair({
          preMergeSnapshotId: outcome.preMergeSnapshotId || '',
          snapshotPort: builderAutoMergeSnapshotPort(),
        })
        if (acceptance.outcome !== 'accepted') {
          const failed = await failBuilderRepositoryRepairAfterMergedDeployment({
            pullRequestNumber: outcome.pullRequestNumber,
            mergeCommitSha: outcome.mergeCommitSha,
            detail: acceptance.detail,
            error: acceptance.outcome === 'rolled_back'
              ? 'builder_repository_production_rolled_back'
              : 'builder_repository_production_unresolved',
          })
          if (failed) builderJobsFailed += 1
          continue
        }
        productionAcceptancePassed = true
      }
      const completed = await completeBuilderRepositoryRepairAfterMerge({
        pullRequestNumber: outcome.pullRequestNumber,
        mergeCommitSha: outcome.mergeCommitSha,
        baseBranch: outcome.baseBranch,
        detail: outcome.detail,
        mergeWatchOutcome: outcome.mergeWatchOutcome,
        deploymentId: outcome.deploymentId,
        deploymentState: outcome.deploymentState,
        preMergeSnapshotId: outcome.preMergeSnapshotId,
        productionAcceptancePassed,
      }).catch(error => {
        console.error('[builder_repository_merge_job_reconcile_failed]', {
          pullRequestNumber: outcome.pullRequestNumber,
          message: error instanceof Error ? error.message : 'unknown',
        })
        return false
      })
      if (completed) builderJobsCompleted += 1
      continue
    }

    if (outcome.outcome === 'refused' && outcome.reason === 'base_superseded') {
      const failed = await failBuilderRepositoryRepairAfterSupersededBase({
        pullRequestNumber: outcome.pullRequestNumber,
        baseBranch: outcome.baseBranch,
        detail: outcome.detail,
      }).catch(error => {
        console.error('[builder_repository_superseded_job_reconcile_failed]', {
          pullRequestNumber: outcome.pullRequestNumber,
          message: error instanceof Error ? error.message : 'unknown',
        })
        return false
      })
      if (failed) builderJobsFailed += 1
    }
  }
  return NextResponse.json({ ...result, builderJobsCompleted, builderJobsFailed }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}
