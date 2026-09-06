import { builderRunSourceEvidence } from './source-evidence.ts'
import { builderPendingWriteEvidence } from './evidence-events.ts'
// lib/builder/repository-repair.ts
import { createBuilderCodingAiPort } from '../cos/aiPort.ts'
import { BUILDER_TURN_TIMEOUT_ERROR, createGovernedBuilderAiPort } from './control-adapter.ts'
import { BuilderToolLoop } from './tool-loop.ts'
import { normalizeBuilderSandboxCommand } from './project-context.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { verifiedRepairLesson } from './verified-lessons.ts'
import { inferBuilderCertificationAttempt } from './certification.ts'
import { parseSignalBoostRepositoryRepairTarget, resolveSignalBoostRepositoryCommit, signalBoostRepositoryRepairObjective, type SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'
import { publishSignalBoostRepositoryRepair } from './repository-repair-writeback.ts'
import { attemptSignalBoostRepositoryAutoMerge, type AutoMergeResult } from './repository-repair-automerge.ts'
import { watchMergedDeployment, type MergeWatchResult } from './repository-merge-watch.ts'
import { VercelRepositoryRepairSession } from './vercel-repository-repair-session.ts'
import type { BuilderRunnerPort, BuilderToolTrace } from './contracts.ts'
import type { StateSnapshotPort } from '@/lib/portable/state-snapshot-port'
import { retrieveValidatedCognitiveSkills } from '@/lib/ai/cos/cognitiveSkillContext'
import { recordVerifiedCognitiveProductionOutcome } from '@/lib/ai/cos/cognitiveProductionOutcome'
import { verifiedBuilderCognitiveApplication } from './cognitive-application.ts'

export type SignalBoostRepositoryRepairExecution = Readonly<{
  status: number
  payload: Record<string, unknown>
}>

const DEFAULT_REPOSITORY_REQUEST_BUDGET_MS = 250_000

// Auto-merge is OFF unless the environment says otherwise, explicitly and exactly.
// Any other value — unset, empty, '1', 'yes' — leaves the lane PR-only.
function autoMergeEnabled(): boolean {
  return String(process.env.BUILDER_AUTO_MERGE_ENABLED || '').trim().toLowerCase() === 'true'
}
const REPOSITORY_RESULT_RESERVE_MS = 45_000

function publicTrace(trace: readonly BuilderToolTrace[]) {
  return trace.map(({ round, toolId, ok, input, output, error, failureClass, remediation }) => {
    const base = { round, toolId, ok, ...(error ? { error } : {}), ...(failureClass ? { failureClass } : {}), ...(remediation ? { remediation } : {}) }
    if (toolId !== 'run') return { ...base, ...builderPendingWriteEvidence(output), ...(typeof input.path === 'string' ? { path: input.path.slice(0, 240) } : {}) }
    const result = output && typeof output === 'object' ? output as Record<string, unknown> : {}
    return {
      ...base,
      ...builderRunSourceEvidence(output),
      command: typeof input.command === 'string' ? input.command.slice(0, 2_000) : '',
      ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
      ...(typeof result.stdout === 'string' ? { stdout: result.stdout.slice(0, 16_000) } : {}),
      ...(typeof result.stderr === 'string' ? { stderr: result.stderr.slice(0, 16_000) } : {}),
      ...(typeof result.timedOut === 'boolean' ? { timedOut: result.timedOut } : {}),
    }
  })
}

function failedPayload(input: {
  error: string
  workspaceId: string
  files: readonly string[]
  trace: readonly BuilderToolTrace[]
  baseCommitSha: string | null
}): SignalBoostRepositoryRepairExecution {
  return Object.freeze({
    status: input.error === BUILDER_TURN_TIMEOUT_ERROR ? 504 : 422,
    payload: {
      error: input.error,
      source: 'cos-platform-engineer',
      workspaceId: input.workspaceId,
      files: input.files,
      trace: publicTrace(input.trace),
      execution_allowed: true,
      repository_write_allowed: false,
      repository_write_taken: false,
      merge_allowed: false,
      deployment_allowed: false,
      base_commit_sha: input.baseCommitSha,
    },
  })
}

function requestDeadline(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : Date.now() + DEFAULT_REPOSITORY_REQUEST_BUDGET_MS
}

function targetedRepositoryCommand(command: string, target: SignalBoostRepositoryRepairTarget): string {
  const normalized = normalizeBuilderSandboxCommand(command)
  const failingTests = target.pathHints
    .map(path => path.replace(/^saas\//, ''))
    .filter(path => /^(?:tests|test)\/.+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/i.test(path))
    .slice(0, 4)
  // The SignalBoost npm test script enumerates the entire suite and can OOM the 2-vCPU repair
  // sandbox. If the failed build identified exact tests, never allow a broad npm test to replace
  // that evidence; execute those tests directly even if the model asked for the broad script.
  if (failingTests.length > 0 && /^npm\s+(?:run\s+)?test(?:\s|$)/i.test(normalized)) {
    return `node --experimental-strip-types --test ${failingTests.join(' ')}`
  }
  return normalized
}

export async function executeSignalBoostRepositoryRepair(input: {
  userId: string
  rawObjective: string
  workspaceId: string
  deadlineAtMs?: number
  target?: SignalBoostRepositoryRepairTarget
  /**
   * Injected checkpoint port for auto-merge. Absent means no checkpoint, which
   * attemptSignalBoostRepositoryAutoMerge refuses on — the lane stays PR-only.
   */
  snapshotPort?: StateSnapshotPort | null
}): Promise<SignalBoostRepositoryRepairExecution | null> {
  const parsed = input.target ?? parseSignalBoostRepositoryRepairTarget(input.rawObjective)
  if (!parsed) return null
  const target = await resolveSignalBoostRepositoryCommit(parsed)
  const workspace = createSupabaseBuilderWorkspace(input.userId)
  if (!workspace) return Object.freeze({ status: 503, payload: { error: 'Builder storage is unavailable.' } })

  const deadlineAtMs = requestDeadline(input.deadlineAtMs)
  const objective = signalBoostRepositoryRepairObjective(target)
  await workspace.ensureWorkspace(input.workspaceId)
  await workspace.setObjective(input.workspaceId, objective)
  const priorLessons = await workspace.fetchVerifiedRepairLessons().catch(error => {
    console.error('[builder_repository_lesson_read_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    return []
  })
  const cognitive = await retrieveValidatedCognitiveSkills(objective, { specialistFamily: 'software' }).catch(error => {
    console.error('[builder_repository_cognitive_skill_retrieval_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    return { items: [] }
  })

  if (Date.now() >= deadlineAtMs - REPOSITORY_RESULT_RESERVE_MS) {
    return failedPayload({
      error: BUILDER_TURN_TIMEOUT_ERROR,
      workspaceId: input.workspaceId,
      files: [],
      trace: [],
      baseCommitSha: target.fullCommitSha,
    })
  }

  let session: VercelRepositoryRepairSession | null = null
  try {
    session = await VercelRepositoryRepairSession.create(target, { deadlineAtMs })
    const aiDeadlineAtMs = deadlineAtMs - REPOSITORY_RESULT_RESERVE_MS
    if (Date.now() >= aiDeadlineAtMs) {
      return failedPayload({
        error: BUILDER_TURN_TIMEOUT_ERROR,
        workspaceId: input.workspaceId,
        files: [],
        trace: [],
        baseCommitSha: target.fullCommitSha,
      })
    }

    // Platform Engineer has its own persistent repository runner rather than the ordinary Builder
    // sandbox runner. Apply the same command normalization here and force exact failed-test targets
    // when available so a broad npm test cannot OOM the repository sandbox.
    const repositoryRunner: BuilderRunnerPort = {
      run: runInput => session!.run({
        ...runInput,
        command: targetedRepositoryCommand(runInput.command, target),
      }),
    }

    const result = await new BuilderToolLoop(
      createGovernedBuilderAiPort(createBuilderCodingAiPort(), { deadlineAtMs: aiDeadlineAtMs }),
      session,
      repositoryRunner,
    ).run({
      objective,
      workspaceId: input.workspaceId,
      priorLessons,
      cognitiveSkills: cognitive.items,
      maxRounds: 20,
      // Repository-control prompts are larger than ordinary chat prompts. Production telemetry
      // has shown valid responses slightly above 35s, so retain a bounded 55s round budget.
      modelRoundTimeoutMs: 55_000,
    })

    // A deadline failure must return immediately. Collecting an unverified repository diff can run
    // several more sandbox commands and recreate the exact Vercel/browser timeout this guard closes.
    if (result.ok === false && result.error === BUILDER_TURN_TIMEOUT_ERROR) {
      const files = (await workspace.listFiles(input.workspaceId)).map(file => file.path)
      return failedPayload({
        error: result.error,
        workspaceId: input.workspaceId,
        files,
        trace: result.trace,
        baseCommitSha: target.fullCommitSha,
      })
    }

    const changes = await session.collectChanges()
    const patchPresent = Boolean(changes.patch.trim())
    const patchPath = result.ok && patchPresent ? 'repository-repair.patch' : 'repository-repair-unverified.patch'
    if (patchPresent) await workspace.writeFile(input.workspaceId, patchPath, changes.patch)
    for (const file of changes.files) await workspace.writeFile(input.workspaceId, `repository/${file.path}`, file.content)
    const files = (await workspace.listFiles(input.workspaceId)).map(file => file.path)

    if (result.ok === false) {
      return failedPayload({
        error: result.error,
        workspaceId: input.workspaceId,
        files,
        trace: result.trace,
        baseCommitSha: target.fullCommitSha,
      })
    }
    if (!patchPresent) {
      return failedPayload({
        error: 'builder_repository_repair_produced_no_patch',
        workspaceId: input.workspaceId,
        files,
        trace: result.trace,
        baseCommitSha: target.fullCommitSha,
      })
    }

    const lesson = verifiedRepairLesson(result)
    if (lesson) await workspace.recordVerifiedRepairLesson(input.workspaceId, lesson).catch(error => {
      console.error('[builder_repository_lesson_write_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })
    const certification = inferBuilderCertificationAttempt(result)
    if (certification) await workspace.recordCertificationAttempt(input.workspaceId, certification).catch(error => {
      console.error('[builder_repository_certification_write_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })
    if (verifiedBuilderCognitiveApplication(result)) {
      const successfulRuns = result.trace.filter(item => item.toolId === 'run' && item.ok).length
      await Promise.all(cognitive.items.map(item => recordVerifiedCognitiveProductionOutcome({
        skillKey: item.skillKey,
        success: true,
        score: 1,
        evidence: {
          source: 'cos_software_specialist_platform_engineer',
          verification: 'repository_changed_and_host_command_exit_zero',
          successfulRuns,
          authorityGranted: false,
        },
      }).catch(error => {
        console.error('[builder_repository_cognitive_application_record_failed]', { skillKey: item.skillKey, message: error instanceof Error ? error.message : 'unknown' })
      })))
    }

    const writeback = await publishSignalBoostRepositoryRepair({
      target,
      workspaceId: input.workspaceId,
      files: changes.files,
      patch: changes.patch,
    })
    // Auto-merge is attempted ONLY on a real published PR, only behind the env flag, and it
    // refuses itself on a danger category or a missing/unrestorable checkpoint. A refusal here
    // changes nothing: the PR stays open for human review, exactly as before.
    let autoMerge: AutoMergeResult | null = null
    if (autoMergeEnabled() && writeback.stage === 'pr_created' && writeback.pullRequestNumber) {
      autoMerge = await attemptSignalBoostRepositoryAutoMerge({
        files: changes.files,
        patch: changes.patch,
        pullRequestNumber: writeback.pullRequestNumber,
        snapshotPort: input.snapshotPort ?? null,
      }).catch(error => {
        console.error('[builder_repository_automerge_failed]', { message: error instanceof Error ? error.message : 'unknown' })
        return null
      })
    }
    // A merge that is never looked at is the whole risk. Watch the deployment it produced and
    // roll back on failure — bounded by whatever request budget is left, and reporting an
    // honest "unresolved" rather than rolling back on a merely slow build.
    let mergeWatch: MergeWatchResult | null = null
    if (autoMerge?.merged && autoMerge.mergeCommitSha && autoMerge.preMergeSnapshotId) {
      mergeWatch = await watchMergedDeployment({
        mergeCommitSha: autoMerge.mergeCommitSha,
        preMergeSnapshotId: autoMerge.preMergeSnapshotId,
        snapshotPort: input.snapshotPort ?? null,
        projectId: process.env.VERCEL_PROJECT_ID || '',
        teamId: process.env.VERCEL_TEAM_ID || undefined,
        token: process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '',
        deadlineAtMs,
      })
    }

    const autoMergeReply = !autoMerge
      ? ''
      : autoMerge.merged
        ? ` It was then auto-merged as ${autoMerge.mergeCommitSha}, with deployment ${autoMerge.preMergeSnapshotId} captured beforehand as the rollback target.${mergeWatch ? ` ${mergeWatch.detail}` : ''}`
        : ` Auto-merge was attempted and refused (${autoMerge.reason}): ${autoMerge.detail} The pull request remains open for review.`

    const writebackReply = writeback.stage === 'pr_created' && writeback.pullRequestNumber
      ? `A governed review branch ${writeback.branch} and PR #${writeback.pullRequestNumber} were created from pinned commit ${target.fullCommitSha}. The agent did not merge or deploy it.`
      : writeback.repositoryWriteTaken
        ? `A verified patch was created from pinned commit ${target.fullCommitSha}, and repository write-back began but stopped after ${writeback.stage}${writeback.commitSha ? ` at commit ${writeback.commitSha}` : ''}${writeback.branch ? ` on branch ${writeback.branch}` : ''}${writeback.error ? ` (${writeback.error})` : ''}. Nothing was merged or deployed.`
        : `A reviewable patch was created from pinned commit ${target.fullCommitSha}. Repository write-back was not taken${writeback.error ? ` (${writeback.error})` : ''}. Nothing was merged or deployed.`

    return Object.freeze({
      status: 200,
      payload: {
        source: 'cos-platform-engineer',
        workspaceId: input.workspaceId,
        reply: `${result.answer}\n\n${writebackReply}${autoMergeReply}`,
        files,
        trace: publicTrace(result.trace),
        execution_allowed: true,
        repository_write_allowed: writeback.repositoryWriteAllowed,
        repository_write_taken: writeback.repositoryWriteTaken,
        repository_write_stage: writeback.stage,
        repository_write_error: writeback.error,
        merge_allowed: autoMergeEnabled(),
        merge_taken: Boolean(autoMerge?.merged),
        merge_refused_reason: autoMerge && !autoMerge.merged ? autoMerge.reason : null,
        merge_commit_sha: autoMerge?.mergeCommitSha ?? null,
        pre_merge_snapshot_id: autoMerge?.preMergeSnapshotId ?? null,
        merge_watch_outcome: mergeWatch?.outcome ?? null,
        merge_watch_deployment_id: mergeWatch?.deploymentId ?? null,
        merge_watch_deployment_state: mergeWatch?.deploymentState ?? null,
        deployment_allowed: false,
        base_commit_sha: target.fullCommitSha,
        branch: target.branch,
        repair_branch: writeback.branch,
        repair_commit_sha: writeback.commitSha,
        pull_request_number: writeback.pullRequestNumber,
        pull_request_url: writeback.pullRequestUrl,
      },
    })
  } finally {
    await session?.close()
  }
}
