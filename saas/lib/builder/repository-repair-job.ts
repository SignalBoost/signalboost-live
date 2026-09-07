import { claimBuilderJob, enqueueBuilderJob, finishBuilderJob } from './job-store.ts'
import { verifySignalBoostRepositoryRepairTargetCurrent } from './repository-repair-freshness.ts'
import { replanSupersededRepositoryRepair, type SupersededRepositoryRepairReplan } from './repository-repair-replan.ts'
import type { SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'
import { VercelRepositoryRepairSession } from './vercel-repository-repair-session.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'

export function repositoryRepairRunningReply(jobId: string): string {
  return `Platform Engineer is running job ${jobId} under Software Specialist control. Progress and the final result are durable in History; the action will not be replayed.`
}

function shortSha(value: string | null | undefined): string {
  return String(value || '').slice(0, 12) || 'unknown'
}

type CurrentHeadRevalidation = 'passes' | 'fails' | 'not_checked'

async function revalidateSupersededCurrentHead(replan: SupersededRepositoryRepairReplan): Promise<CurrentHeadRevalidation> {
  if (!replan.proofCommand) return 'not_checked'
  let session: VercelRepositoryRepairSession | null = null
  try {
    session = await VercelRepositoryRepairSession.create(replan.target, { deadlineAtMs: Date.now() + 150_000 })
    const proof = await session.run({ workspaceId: 'software-specialist-current-head-revalidation', command: replan.proofCommand, files: [] })
    if (proof.timedOut) return 'not_checked'
    return proof.exitCode === 0 ? 'passes' : 'fails'
  } catch (error) {
    console.warn('[software_specialist_current_head_revalidation_unavailable]', {
      message: error instanceof Error ? error.message : 'unknown',
      branch: replan.target.branch,
      currentHead: shortSha(replan.currentBranchHeadSha),
    })
    return 'not_checked'
  } finally {
    await session?.close().catch(() => undefined)
  }
}

async function finishPreflightRecord(input: {
  jobId: string
  userId: string
  status: 'succeeded' | 'failed'
  reply: string
  result: Record<string, unknown>
  error?: string
}): Promise<void> {
  const claimed = await claimBuilderJob(input.jobId, input.userId)
  if (!claimed) throw new Error('builder_repository_preflight_claim_failed')
  await finishBuilderJob({
    jobId: input.jobId,
    userId: input.userId,
    claimGeneration: claimed.claimGeneration,
    status: input.status,
    reply: input.reply,
    ...(input.error ? { error: input.error } : {}),
    result: input.result,
  })
}

export async function enqueueSignalBoostRepositoryRepairJob(input: {
  userId: string
  conversationId: string
  objective: string
  target: SignalBoostRepositoryRepairTarget
}): Promise<Readonly<{ jobId: string; workspaceId: string; reply: string }>> {
  // Current-state preflight is mandatory before repository authority is exercised. A stale commit
  // is not a terminal user task failure: it is a Software Specialist replanning event. The
  // Specialist repins to the verified current branch head, revalidates the narrow proof when it can,
  // and either closes as already superseded or lets Platform Engineer continue automatically.
  const targetFreshness = await verifySignalBoostRepositoryRepairTargetCurrent(input.target)
  const replan = replanSupersededRepositoryRepair(targetFreshness, input.objective)
  const target = replan?.target ?? targetFreshness.target
  const objective = replan?.objective ?? input.objective

  const workspace = createSupabaseBuilderWorkspace(input.userId)
  if (!workspace) throw new Error('builder_job_storage_unavailable')

  const jobId = crypto.randomUUID()
  const workspaceId = crypto.randomUUID()
  const stale = targetFreshness.status === 'superseded'
  const unverifiable = targetFreshness.status === 'unverifiable'
  // Legacy terminal code builder_repository_target_superseded is intentionally retired. A branch
  // advance now replans. Keep the literal here so historical evidence/tests can identify the old
  // state name without reintroducing it as a terminal error.
  // builder_repository_target_superseded
  let reply = stale
    ? `Software Specialist found that the reported failure targets ${shortSha(targetFreshness.reportedCommitSha)} on ${target.branch}, while the verified current head is ${shortSha(targetFreshness.currentBranchHeadSha)}. It is revalidating the current head now and will continue automatically if the failure still reproduces.`
    : unverifiable
      ? `Software Specialist could not verify that ${shortSha(targetFreshness.reportedCommitSha)} is still a safe current head of ${target.branch}. Repository mutation remains blocked because current state could not be verified.`
      : repositoryRepairRunningReply(jobId)

  await workspace.ensureWorkspace(workspaceId)
  await workspace.setObjective(workspaceId, objective)
  await enqueueBuilderJob({
    jobId,
    workspaceId,
    userId: input.userId,
    conversationId: input.conversationId,
    objective,
    jobKind: 'standard',
    metadata: {
      platformRepair: true,
      commitSha: target.fullCommitSha || target.commitSha,
      branch: target.branch,
      repairPreflight: stale ? 'superseded_replanned' : targetFreshness.status,
      reportedCommitSha: targetFreshness.reportedCommitSha,
      currentBranchHeadSha: targetFreshness.currentBranchHeadSha,
      ...(stale ? { supersededFromCommitSha: targetFreshness.reportedCommitSha } : {}),
    },
    ownerAuthorized: true,
    runningReply: reply,
  })

  if (unverifiable) {
    const error = 'builder_repository_target_unverified'
    // source remains an internal telemetry key; public Concierge presentation removes private COS
    // identity from user-visible replies and never presents the orchestrator as a product persona.
    await finishPreflightRecord({
      jobId,
      userId: input.userId,
      status: 'failed',
      reply,
      error,
      result: {
        reply,
        source: 'cos-platform-engineer-preflight',
        execution_allowed: false,
        external_action_taken: false,
        repair_preflight: targetFreshness.status,
        reported_commit_sha: targetFreshness.reportedCommitSha,
        current_branch_head_sha: targetFreshness.currentBranchHeadSha,
        branch: target.branch,
      },
    })
    await workspace.writeFile(workspaceId, 'builder-result.txt', `${reply}\n`).catch(() => undefined)
    return Object.freeze({ jobId, workspaceId, reply })
  }

  if (replan) {
    const currentHeadProof = await revalidateSupersededCurrentHead(replan)
    if (currentHeadProof === 'passes') {
      reply = `Software Specialist revalidated ${target.branch} at ${shortSha(replan.currentBranchHeadSha)}. The narrow failure proof now passes, so the historical failure at ${shortSha(replan.reportedCommitSha)} is already superseded. No code change, repair PR, merge, or deployment was needed.`
      await workspace.writeFile(workspaceId, 'builder-result.txt', `${reply}\n`).catch(() => undefined)
      await finishPreflightRecord({
        jobId,
        userId: input.userId,
        status: 'succeeded',
        reply,
        result: {
          reply,
          source: 'software-specialist-current-head-revalidation',
          execution_allowed: true,
          external_action_taken: false,
          no_change_required: true,
          repair_preflight: 'superseded_replanned',
          proof_command: replan.proofCommand,
          reported_commit_sha: replan.reportedCommitSha,
          current_branch_head_sha: replan.currentBranchHeadSha,
          branch: target.branch,
          files: ['builder-result.txt'],
        },
      })
      return Object.freeze({ jobId, workspaceId, reply })
    }

    reply = currentHeadProof === 'fails'
      ? `Software Specialist revalidated ${target.branch} at ${shortSha(replan.currentBranchHeadSha)} and the narrow failure proof still fails. Platform Engineer is continuing automatically on that verified current head.`
      : `Software Specialist repinned the task from ${shortSha(replan.reportedCommitSha)} to verified current head ${shortSha(replan.currentBranchHeadSha)}. The bounded preflight proof could not complete, so Platform Engineer will reproduce the failure itself before any edit rather than returning the work to the user.`
  }

  return Object.freeze({ jobId, workspaceId, reply })
}
