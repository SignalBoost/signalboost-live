import { enqueueBuilderJob } from './job-store.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'

export function repositoryRepairRunningReply(jobId: string): string {
  return `COS Platform Engineer is running job ${jobId}. Progress and the final result are durable in History; the action will not be replayed.`
}

export async function enqueueSignalBoostRepositoryRepairJob(input: {
  userId: string
  conversationId: string
  objective: string
  target: SignalBoostRepositoryRepairTarget
}): Promise<Readonly<{ jobId: string; workspaceId: string; reply: string }>> {
  const workspace = createSupabaseBuilderWorkspace(input.userId)
  if (!workspace) throw new Error('builder_job_storage_unavailable')

  const jobId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  const reply = repositoryRepairRunningReply(jobId)
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
      commitSha: input.target.fullCommitSha || input.target.commitSha,
      branch: input.target.branch,
    },
    ownerAuthorized: true,
    runningReply: reply,
  })
  return Object.freeze({ jobId, workspaceId, reply })
}
