import { enqueueBuilderJob, finishBuilderJob } from './job-store.ts'
import { verifySignalBoostRepositoryRepairTargetCurrent } from './repository-repair-freshness.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'

export function repositoryRepairRunningReply(jobId: string): string {
  return `COS Platform Engineer is running job ${jobId}. Progress and the final result are durable in History; the action will not be replayed.`
}

function shortSha(value: string | null | undefined): string {
  return String(value || '').slice(0, 12) || 'unknown'
}

export async function enqueueSignalBoostRepositoryRepairJob(input: {
  userId: string
  conversationId: string
  objective: string
  target: SignalBoostRepositoryRepairTarget
}): Promise<Readonly<{ jobId: string; workspaceId: string; reply: string }>> {
  // Current-state preflight is mandatory before repository authority is exercised. Pasted build
  // evidence may name a real historical commit; if its branch has advanced, repairing that stale
  // snapshot wastes Builder work and can produce a wrong-file patch for a failure already fixed.
  const targetFreshness = await verifySignalBoostRepositoryRepairTargetCurrent(input.target)
  const target = targetFreshness.target

  const workspace = createSupabaseBuilderWorkspace(input.userId)
  if (!workspace) throw new Error('builder_job_storage_unavailable')

  const jobId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  const stale = targetFreshness.status === 'superseded'
  const blocked = targetFreshness.status !== 'current'
  const reply = stale
    ? `COS checked the current repository state before repair. The reported failure targets ${shortSha(targetFreshness.reportedCommitSha)} on ${target.branch}, but that branch is now at ${shortSha(targetFreshness.currentBranchHeadSha)}. I did not launch Platform Engineer because the failure snapshot is stale. Re-run the current head or provide a failure from the current revision.`
    : targetFreshness.status === 'unverifiable'
      ? `COS could not verify that ${shortSha(targetFreshness.reportedCommitSha)} is still the current head of ${target.branch}. I did not launch Platform Engineer because repository repair fails closed when current state cannot be verified.`
      : repositoryRepairRunningReply(jobId)

  await workspace.ensureWorkspace(workspaceId)
  await workspace.setObjective(workspaceId, input.objective)
  await enqueueBuilderJob({
    jobId,
    workspaceId,
    userId: input.userId,
    conversationId: input.conversationId,
    objective: input.objective,
    jobKind: 'standard',
    metadata: {
      platformRepair: true,
      commitSha: target.fullCommitSha || target.commitSha,
      branch: target.branch,
      repairPreflight: targetFreshness.status,
      reportedCommitSha: targetFreshness.reportedCommitSha,
      currentBranchHeadSha: targetFreshness.currentBranchHeadSha,
    },
    ownerAuthorized: true,
    runningReply: reply,
  })

  if (blocked) {
    const error = stale
      ? 'builder_repository_target_superseded'
      : 'builder_repository_target_unverified'
    await finishBuilderJob({
      jobId,
      userId: input.userId,
      status: 'failed',
      reply,
      error,
      result: {
        source: 'cos-platform-engineer-preflight',
        execution_allowed: false,
        external_action_taken: false,
        repair_preflight: targetFreshness.status,
        reported_commit_sha: targetFreshness.reportedCommitSha,
        current_branch_head_sha: targetFreshness.currentBranchHeadSha,
        branch: target.branch,
      },
    })
  }

  return Object.freeze({ jobId, workspaceId, reply })
}
