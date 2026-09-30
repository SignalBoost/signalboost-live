import { withHostProductionHarnessIngress } from '../../platform-harness/runtime/host-ingress.ts'
import { classifyBuilderDocumentationIntent } from './documentation-intent.ts'
import { builderRunSourceEvidence } from './source-evidence.ts'
import { builderPendingWriteEvidence } from './evidence-events.ts'
// lib/builder/job-runner.ts
import { createBuilderCodingAiPort } from '../cos/aiPort.ts'
import { BUILDER_TURN_TIMEOUT_ERROR, createGovernedBuilderAiPort } from './control-adapter.ts'
import type { BuilderToolTrace } from './contracts.ts'
import { runDebugFileJob, type DebugFilePlan } from './debug-file-job.ts'
import { finishBuilderJob, claimBuilderJob, deferBuilderJobForCapacity, pauseBuilderJob, readBuilderWorkspaceFingerprint, type BuilderJobRecord } from './job-store.ts'
import { formatBuilderOperatorRepairReply } from './operator-narration.ts'
import { builderNextAction } from './user-guidance.ts'
import { isRepairObjective } from './regression-gate.ts'
import { formatBuilderExecutionEvidence } from './execution-evidence.ts'
import { explainInitialBuilderRepair } from './explain-evidence.ts'
import { BuilderToolLoop } from './tool-loop.ts'
import { createBuilderMcpReadPort } from './mcp-read-port.ts'
import { createBuilderPlaywrightCliPort } from './playwright-cli-port.ts'
import { VercelSandboxBuilderRunner } from './vercel-sandbox-runner.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { executeSignalBoostRepositoryRepair } from './repository-repair.ts'
import { parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget } from './repository-repair-target.ts'
import { builderAutoMergeSnapshotPort } from './repository-repair-snapshot-host.ts'
import { retrieveValidatedCognitiveSkills, type CognitiveSkillContextResult } from '@/lib/ai/cos/cognitiveSkillContext'
import { recordVerifiedCognitiveProductionOutcome } from '@/lib/ai/cos/cognitiveProductionOutcome'
import { verifiedBuilderCognitiveApplication } from './cognitive-application.ts'
import { recordBuilderUniversityProductionOutcome } from './university-outcome.ts'
import { deepInfraMaxRunUsd } from '../ai/cos/deepInfraSpendPolicy.ts'
import { runWithoutTurnDeadline } from '../ai/cos/cosTurnBudget.ts'
import { workingAgentKnowledgeBlock } from '@/lib/ai/cos/workingAgentKnowledge'
import { formatBuilderEpisodesForPrompt, recordBuilderEpisode, retrieveBuilderEpisodes } from './episodic-memory.ts'
import { recordBuilderCompetencyGap } from './competency-gap.ts'

const BUILDER_JOB_BUDGET_MS = 260_000
const BUILDER_JOB_RESULT_RESERVE_MS = 20_000
const SELF_HEALING_REPOSITORY_BUDGET_MS = 285_000
const MAX_SELF_HEALING_EXECUTION_TIMEOUT_DEFERRALS = 3

function selfHealingCapacityJob(job: BuilderJobRecord): boolean {
  return job.ownerAuthorized && (
    job.metadata.selfHealingUniversityDistillation === true
    || job.metadata.selfHealingOwnedSite === true
    || job.metadata.selfHealingOwnedAudit === true
    || job.metadata.selfHealingProductionRecovery === true
  )
}

type SelfHealingDeferralReason = 'builder_runpod_primary_busy' | 'builder_turn_timeout' | 'builder_model_round_timeout'

function metadataCount(job: BuilderJobRecord, key: string): number {
  const value = Number(job.metadata[key])
  return Number.isInteger(value) && value >= 0 ? value : 0
}

function capacityDeferrable(job: BuilderJobRecord, error: string | null): error is SelfHealingDeferralReason {
  if (error === 'builder_runpod_primary_busy') return true
  if (error !== BUILDER_TURN_TIMEOUT_ERROR && error !== 'builder_model_round_timeout') return false
  return metadataCount(job, 'builderExecutionTimeoutDeferrals') < MAX_SELF_HEALING_EXECUTION_TIMEOUT_DEFERRALS
}

async function deferSelfHealingCapacity(job: BuilderJobRecord, error: string | null, trace: readonly unknown[]): Promise<boolean> {
  if (!selfHealingCapacityJob(job) || !capacityDeferrable(job, error)) return false
  const deferred = await deferBuilderJobForCapacity({ job, reason: error })
  if (deferred) {
    console.info('[builder_self_healing_capacity_deferred]', {
      jobId: job.id,
      claimGeneration: job.claimGeneration,
      reason: error,
      productiveTraceSteps: trace.length,
      executionTimeoutDeferrals: metadataCount(job, 'builderExecutionTimeoutDeferrals')
        + (error === 'builder_runpod_primary_busy' ? 0 : 1),
    })
  }
  return deferred
}

const emptyCognitiveContext = (): CognitiveSkillContextResult => ({ retrieved: 0, relevant: 0, selected: 0, dependencyRejected: 0, items: [] })

async function recordAppliedCognitiveSkills(job: BuilderJobRecord, skillKeys: readonly string[], successfulRuns: number): Promise<void> {
  await Promise.all(skillKeys.map(skillKey => recordVerifiedCognitiveProductionOutcome({
    skillKey,
    success: true,
    score: 1,
    evidence: {
      source: 'cos_software_specialist_builder',
      builderJobId: job.id,
      verification: 'workspace_changed_and_host_command_exit_zero',
      successfulRuns,
      authorityGranted: false,
    },
  }).catch(error => {
    console.error('[builder_cognitive_application_record_failed]', { skillKey, message: error instanceof Error ? error.message : 'unknown' })
  })))
}

function publicTrace(trace: readonly BuilderToolTrace[]) {
  return trace.map(({ round, toolId, ok, input, output, error, failureClass, remediation }) => {
    const base = {
      round,
      toolId,
      ok,
      ...(error ? { error } : {}),
      ...(failureClass ? { failureClass } : {}),
      ...(remediation ? { remediation } : {}),
    }
    if (toolId !== 'run') {
      const shape = output && typeof output === 'object' ? output as Record<string, unknown> : {}
      const telemetry = toolId === 'model_control'
        ? Object.fromEntries(
            (['responseLength', 'startsWithObject', 'endsWithObject', 'hasThinkOpen', 'hasThinkClose', 'hasUnclosedObject', 'anyValidJson'] as const)
              .filter(key => typeof shape[key] === 'number' || typeof shape[key] === 'boolean')
              .map(key => [key, shape[key]]),
          )
        : {}
      return {
        ...base,
        ...builderPendingWriteEvidence(output),
        ...(typeof input.path === 'string' ? { path: input.path.slice(0, 240) } : {}),
        ...(toolId === 'edit_file' && ok && typeof input.search === 'string' && typeof input.replace === 'string'
          ? { change: { search: input.search.slice(0, 4000), replace: input.replace.slice(0, 4000),
              truncated: input.search.length > 4000 || input.replace.length > 4000 } } : {}),
        ...telemetry,
      }
    }
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

function debugPlan(job: BuilderJobRecord): DebugFilePlan | null {
  if (job.jobKind !== 'debug_file') return null
  const path = typeof job.metadata.debugPath === 'string' ? job.metadata.debugPath : ''
  const command = typeof job.metadata.debugCommand === 'string' ? job.metadata.debugCommand : ''
  const runtime = job.metadata.debugRuntime === 'python3' ? 'python3' : 'node'
  const rawPaths = Array.isArray(job.metadata.debugPaths) ? job.metadata.debugPaths : []
  const files = rawPaths.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  if (!path || !command) return null
  return Object.freeze({ path, command, runtime, files: files.length ? files : [path] })
}

function oneLine(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(-500)
}

function fallbackFailureReply(error: string, trace: ReturnType<typeof publicTrace>): string {
  const tail = trace.slice(-5).map((entry: any) => {
    const parts = [`#${entry.round ?? '?'} ${entry.toolId || 'tool'} ${entry.ok ? 'ok' : 'failed'}`]
    if (typeof entry.exitCode === 'number') parts.push(`exit ${entry.exitCode}`)
    if (entry.command) parts.push(`$ ${oneLine(entry.command).slice(0, 180)}`)
    if (entry.error) parts.push(oneLine(entry.error))
    const stream = oneLine(entry.stderr) || oneLine(entry.stdout)
    if (stream) parts.push(stream)
    return `  ${parts.join(' · ')}`
  })
  const reason = /budget_exhausted|builder_turn_timeout|builder_time_budget_reached/.test(error)
    ? 'Builder reached its work limit before completing the requested files and verification.'
    : `Builder could not complete the task: ${error}`
  const execution = trace.some(entry => entry.toolId === 'run')
    ? formatBuilderExecutionEvidence(trace)
    : 'No command was run. No runtime or test result was recorded.'
  return `${reason}\n\n${execution}${tail.length ? `\n\nBuilder evidence:\n${tail.join('\n')}` : ''}`
}

function repairAwareFailureReply(job: BuilderJobRecord, error: string, trace: ReturnType<typeof publicTrace>): string {
  return isRepairObjective(job.objective)
    ? formatBuilderOperatorRepairReply({ ok: false, error, trace })
    : fallbackFailureReply(error, trace)
}

function historyReply(reply: string, workspaceId: string, files: readonly string[]): string {
  const links = files.slice(0, 20).map(path => {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const label = path.replace(/[\[\]]/g, '')
    return `- [Download ${label}](/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${encodedPath})`
  })
  return links.length ? `${reply.trim()}\n\nBuilder files:\n${links.join('\n')}` : reply.trim()
}

async function terminalFailure(job: BuilderJobRecord, error: string, trace: readonly BuilderToolTrace[] = job.checkpoint?.trace || []): Promise<void> {
  const safeTrace = publicTrace(trace)
  const workspace = createSupabaseBuilderWorkspace(job.userId)
  const plainReply = `${repairAwareFailureReply(job, error, safeTrace)}\n\n${builderNextAction(error, trace)}`
  if (workspace) await workspace.writeFile(job.workspaceId, 'builder-result.txt', `${plainReply.trim()}\n`).catch(() => undefined)
  const files = workspace ? await workspace.listFiles(job.workspaceId).then(items => items.map(item => item.path)).catch(() => []) : []
  const reply = historyReply(plainReply, job.workspaceId, files)
  await finishBuilderJob({
    jobId: job.id,
    userId: job.userId,
    claimGeneration: job.claimGeneration,
    status: 'failed',
    reply,
    error,
    result: {
      jobId: job.id,
      workspaceId: job.workspaceId,
      status: 'failed',
      error,
      reply,
      files,
      trace: safeTrace,
    },
  })
  await recordBuilderUniversityProductionOutcome({
    job,
    status: 'failure',
    verification: 'generation_fenced_terminal_builder_failure',
    facts: { error },
  }).catch(outcomeError => console.error('[builder_university_outcome_record_failed]', {
    jobId: job.id,
    message: outcomeError instanceof Error ? outcomeError.message : 'unknown',
  }))
  await recordBuilderCompetencyGap({
    jobId: job.id,
    objective: job.objective,
    error,
    ownerAuthorized: job.ownerAuthorized === true,
  }).catch(gapError => console.error('[builder_competency_gap_record_failed]', {
    jobId: job.id,
    message: gapError instanceof Error ? gapError.message : 'unknown',
  }))
}

async function runBuilderPlaywrightCliCanary(job: BuilderJobRecord): Promise<void> {
  if (job.ownerAuthorized !== true || job.metadata.builderPlaywrightCliCanary !== true) {
    throw new Error('builder_playwright_cli_canary_not_authorized')
  }

  const browserCli = createBuilderPlaywrightCliPort({ ownerAuthorized: true })
  const steps = [
    { action: 'open' as const, url: 'https://itmounts.com/' },
    { action: 'snapshot' as const },
    { action: 'console' as const, level: 'info' as const },
    { action: 'requests' as const },
    { action: 'close' as const },
  ]
  const evidence: Array<{
    action: string
    ok: boolean
    exitCode: number
    timedOut: boolean
    failureCode?: string
  }> = []

  try {
    for (const input of steps) {
      const observed = await browserCli.invoke(input)
      evidence.push({
        action: observed.action,
        ok: observed.ok,
        exitCode: observed.exitCode,
        timedOut: observed.timedOut,
        ...(observed.failureCode ? { failureCode: observed.failureCode } : {}),
      })
      if (!observed.ok) {
        const error = `builder_playwright_cli_canary_failed:${observed.action}:${observed.failureCode || 'cli_exit_nonzero'}`
        const reply = `Builder Playwright CLI Production canary failed at ${observed.action}.`
        await finishBuilderJob({
          jobId: job.id,
          userId: job.userId,
          claimGeneration: job.claimGeneration,
          status: 'failed',
          reply,
          error,
          result: {
            schemaVersion: 'builder-playwright-cli-production-canary-v1',
            jobId: job.id,
            workspaceId: job.workspaceId,
            status: 'failed',
            error,
            reply,
            evidence,
          },
        })
        return
      }
    }

    const reply = 'PLAYWRIGHT_CLI_CANARY_COMPLETE'
    await finishBuilderJob({
      jobId: job.id,
      userId: job.userId,
      claimGeneration: job.claimGeneration,
      status: 'succeeded',
      reply,
      result: {
        schemaVersion: 'builder-playwright-cli-production-canary-v1',
        jobId: job.id,
        workspaceId: job.workspaceId,
        status: 'succeeded',
        reply,
        evidence,
      },
    })
  } finally {
    await browserCli.close().catch(error => {
      console.warn('[builder_playwright_cli_canary_close_failed]', {
        message: error instanceof Error ? error.message : 'unknown',
      })
    })
  }
}

/**
 * Execute one already-enqueued Builder job. The atomic claim makes duplicate invocations harmless;
 * the browser never replays POST and polling GET has no execution authority.
 */
async function runBuilderJobInsideHarness(jobId: string, userId: string): Promise<void> {
  let job: BuilderJobRecord | null = null
  let lastTrace: readonly BuilderToolTrace[] = []
  try {
    job = await claimBuilderJob(jobId, userId)
    if (!job) return

    if (job.claimGeneration === 1 && typeof job.metadata.approvedProposalFingerprint === 'string'
      && await readBuilderWorkspaceFingerprint(job.userId, job.workspaceId) !== job.metadata.approvedProposalFingerprint) {
      await terminalFailure(job, 'builder_proposal_source_changed')
      return
    }

    // Production acceptance is a host-owned, owner-only lane. It must complete in one claim:
    // browser state and browser_cli evidence are deliberately not persisted across Builder checkpoints.
    if (job.ownerAuthorized === true && job.metadata.builderPlaywrightCliCanary === true) {
      await runBuilderPlaywrightCliCanary(job)
      return
    }

    // Preserve the explicit metadata lane's authority check before any target parsing. The recovery
    // path below is owner-only too, so a dropped metadata bit cannot broaden repository authority.
    let parsedLogTarget = null
    if (job.metadata.platformRepair === true) {
      if (!job.ownerAuthorized) {
        await terminalFailure(job, 'builder_repository_repair_owner_required')
        return
      }
      parsedLogTarget = parseSignalBoostRepositoryRepairTarget(job.objective)
    } else if (job.ownerAuthorized) {
      // Owner jobs that carry a failed SignalBoost Vercel clone log must enter Platform Engineer
      // even if enqueue dropped the platformRepair metadata. Isolated sandbox Builder cannot commit.
      parsedLogTarget = parseSignalBoostRepositoryRepairTarget(job.objective)
    }
    const treatAsPlatformRepair = job.metadata.platformRepair === true || Boolean(parsedLogTarget)

    if (treatAsPlatformRepair) {
      const exactTarget = parsedLogTarget ?? parseSignalBoostRepositoryRepairTarget(job.objective)
      const target = exactTarget ?? signalBoostDeployedRepairTarget(job.objective, {
        commitSha: job.metadata.commitSha,
        branch: job.metadata.branch,
      }, { ownerDeveloperLogSubmission: true })
      if (!target) {
        await terminalFailure(job, 'builder_repository_repair_target_unavailable')
        return
      }
      const execution = await executeSignalBoostRepositoryRepair({
        userId: job.userId,
        ownerAuthorized: job.ownerAuthorized === true,
        rawObjective: job.objective,
        workspaceId: job.workspaceId,
        target,
        ...(selfHealingCapacityJob(job)
          ? { deadlineAtMs: Date.now() + SELF_HEALING_REPOSITORY_BUDGET_MS }
          : {}),
        // Null when Vercel credentials are absent, which auto-merge refuses on.
        snapshotPort: builderAutoMergeSnapshotPort(),
      })
      if (!execution) {
        await terminalFailure(job, 'builder_repository_repair_target_unavailable')
        return
      }
      const payload = execution.payload
      const error = typeof payload.error === 'string' ? payload.error : null
      const succeeded = execution.status >= 200 && execution.status < 300 && !error
      const safeTrace = Array.isArray(payload.trace) ? payload.trace as ReturnType<typeof publicTrace> : []
      if (!succeeded && await deferSelfHealingCapacity(job, error, safeTrace)) return
      const baseReply = typeof payload.reply === 'string'
        ? payload.reply
        : fallbackFailureReply(error || 'builder_repository_repair_failed', safeTrace)
      const reply = isRepairObjective(job.objective)
        ? formatBuilderOperatorRepairReply({ ok: succeeded, answer: succeeded ? baseReply : undefined, error: error || undefined, trace: safeTrace })
        : baseReply
      await finishBuilderJob({
        jobId: job.id,
        userId: job.userId,
        claimGeneration: job.claimGeneration,
        status: succeeded ? 'succeeded' : 'failed',
        reply,
        ...(error ? { error } : {}),
        result: { ...payload, jobId: job.id, workspaceId: job.workspaceId, reply },
      })
      // The database may convert a PR-awaiting-merge result to paused. Its terminal evidence is
      // recorded only by repository-repair-job-lifecycle after the fenced reconciliation write.
      const repositoryMergePending = payload.repository_merge_pending === true
        || (payload.repository_write_stage === 'pr_created'
          && payload.merge_allowed === true
          && payload.merge_taken !== true
          && Number.isInteger(Number(payload.pull_request_number))
          && Number(payload.pull_request_number) > 0)
      if (!repositoryMergePending) {
        const repositoryCompleted = payload.merge_taken === true && typeof payload.merge_commit_sha === 'string'
        await recordBuilderUniversityProductionOutcome({
          job,
          status: payload.merge_watch_outcome === 'healthy' ? 'success' : repositoryCompleted ? 'observed' : 'failure',
          verification: payload.merge_watch_outcome === 'healthy'
            ? 'repository_merge_and_production_deployment_healthy'
            : repositoryCompleted ? 'repository_merged_without_healthy_production_proof' : 'generation_fenced_terminal_builder_failure',
          facts: {
            pullRequestNumber: payload.pull_request_number ?? null,
            mergeCommitSha: payload.merge_commit_sha ?? null,
            deploymentId: payload.merge_watch_deployment_id ?? null,
          },
        }).catch(outcomeError => console.error('[builder_university_outcome_record_failed]', {
          jobId: job.id,
          message: outcomeError instanceof Error ? outcomeError.message : 'unknown',
        }))
      }
      return
    }

    const workspace = createSupabaseBuilderWorkspace(job.userId)
    if (!workspace) {
      await terminalFailure(job, 'builder_job_storage_unavailable')
      return
    }

    const cognitive = await retrieveValidatedCognitiveSkills(job.objective, { specialistFamily: 'software' }).catch(error => {
      console.error('[builder_cognitive_skill_retrieval_failed]', { message: error instanceof Error ? error.message : 'unknown' })
      return emptyCognitiveContext()
    })
    // Open/public retained knowledge is shared with the working Builder immediately. This is
    // reference/RAG context only: it cannot authorize tools, prove current facts, or award University
    // credit. The helper is bounded and fails open so ordinary work is not blocked by retrieval.
    const workingKnowledge = await workingAgentKnowledgeBlock(job.objective, 'builder')
    const priorEpisodes = await retrieveBuilderEpisodes({
      userId: job.userId,
      objective: job.objective,
      excludeConversationId: job.conversationId,
      limit: 4,
    }).catch(error => {
      console.warn('[builder_episode_read_failed]', { jobId, message: error instanceof Error ? error.message : 'unknown' })
      return []
    })
    const episodicKnowledge = formatBuilderEpisodesForPrompt(priorEpisodes)
    const combinedWorkingKnowledge = [workingKnowledge, episodicKnowledge].filter(Boolean).join('\n\n')

    const sliceStartedAtMs = Date.now()
    const deadlineAtMs = Date.now() + BUILDER_JOB_BUDGET_MS
    const ai = createGovernedBuilderAiPort(createBuilderCodingAiPort({ yieldToChat: selfHealingCapacityJob(job) }), {
      deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
    })
    const runner = new VercelSandboxBuilderRunner()
    const mcp = createBuilderMcpReadPort({
      tenantId: job.userId,
      userId: job.userId,
      environmentId: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
      ownerAuthorized: job.ownerAuthorized === true,
    })
    const browserCli = createBuilderPlaywrightCliPort({
      ownerAuthorized: job.ownerAuthorized === true,
    })
    const plan = debugPlan(job)
    const documentationPaths = !plan && isRepairObjective(job.objective)
      ? job.checkpoint ? job.checkpoint.documentationPaths ?? null : await classifyBuilderDocumentationIntent(ai, job.objective) : null
    const priorLessons = plan ? [] : await workspace.fetchProjectRepairSignals(job.workspaceId).catch(() => {
      console.warn('[builder_project_lesson_read_failed]', { jobId })
      return []
    })
    const result = plan
      ? await runDebugFileJob({
          objective: job.objective,
          workspaceId: job.workspaceId,
          plan,
          workspace,
          runner,
          ai,
          cognitiveSkills: cognitive.items,
          workingKnowledge: combinedWorkingKnowledge,
        })
      : await new BuilderToolLoop(ai, workspace, runner, mcp, browserCli).run({
          objective: job.objective,
          workspaceId: job.workspaceId,
          priorLessons,
          cognitiveSkills: cognitive.items,
          workingKnowledge: combinedWorkingKnowledge,
          projectContext: job.metadata.projectContext,
          checkpoint: job.checkpoint,
          documentationPaths,
          // Leave room for a slow model round, then a bounded sandbox command and persistence.
          shouldPause: (beforeTool = false) => Date.now() - sliceStartedAtMs >= (beforeTool ? 150_000 : 100_000),
          maxRounds: 96,
          deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
          modelRoundTimeoutMs: 55_000,
        })
    await browserCli.close().catch(error => {
      console.warn('[builder_browser_cli_close_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })

    lastTrace = result.trace
    const files = (await workspace.listFiles(job.workspaceId)).map(file => file.path)
    const trace = publicTrace(result.trace)
    if (result.ok === false && result.checkpoint && job.claimGeneration < 4) {
      const reply = historyReply('Builder saved its progress and will continue automatically. Verification is not complete yet.', job.workspaceId, files)
      await pauseBuilderJob({ job, checkpoint: result.checkpoint, reply,
        result: { jobId: job.id, workspaceId: job.workspaceId, status: 'paused', reply, files, trace } })
      return
    }
    const shouldExplain = Boolean(plan) || isRepairObjective(job.objective) || typeof job.metadata.proposalSourceJobId === 'string'
      || trace.some(item => item.toolId === 'run' && !item.ok)
    const initialReply = async (fallback: string, status: string) => shouldExplain
      ? explainInitialBuilderRepair({
          prompt: job.objective,
          job: { ...job, status, result: { files, trace, ...(result.ok === false ? { error: result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error } : {}) } },
          workspace: { readFile: (workspaceId, path) => workspace.readExistingFile(workspaceId, path) },
          ai, fallback, deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
        })
      : `${fallback}\n\n${formatBuilderExecutionEvidence(trace)}`
    if (result.ok === false) {
      const reply = historyReply(await initialReply(`${repairAwareFailureReply(job, result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error, trace)}\n\n${builderNextAction(result.error, result.trace)}`, 'failed'), job.workspaceId, files)
      await finishBuilderJob({
        jobId: job.id,
        userId: job.userId,
        claimGeneration: job.claimGeneration,
        status: 'failed',
        reply,
        error: result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error,
        result: {
          jobId: job.id,
          workspaceId: job.workspaceId,
          status: 'failed',
          error: result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error,
          reply,
          files,
          trace,
        },
      })
      await recordBuilderUniversityProductionOutcome({
        job,
        status: 'failure',
        verification: 'generation_fenced_terminal_builder_failure',
        facts: { error: result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error },
      }).catch(outcomeError => console.error('[builder_university_outcome_record_failed]', {
        jobId: job.id,
        message: outcomeError instanceof Error ? outcomeError.message : 'unknown',
      }))
      const terminalError = result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error
      await recordBuilderCompetencyGap({
        jobId: job.id,
        objective: job.objective,
        error: terminalError,
        ownerAuthorized: job.ownerAuthorized === true,
      }).catch(gapError => console.error('[builder_competency_gap_record_failed]', {
        jobId: job.id,
        message: gapError instanceof Error ? gapError.message : 'unknown',
      }))
      await recordBuilderEpisode({
        job,
        outcome: 'failed',
        summary: reply,
        evidence: { error: terminalError, files, verification: 'generation_fenced_terminal_builder_failure' },
      }).catch(() => console.warn('[builder_episode_write_failed]', { jobId }))
      return
    }

    if (verifiedBuilderCognitiveApplication(result)) {
      const successfulRuns = result.trace.filter(item => item.toolId === 'run' && item.ok).length
      await recordAppliedCognitiveSkills(job, cognitive.items.map(item => item.skillKey), successfulRuns)
    }

    const baseReply = !documentationPaths && isRepairObjective(job.objective)
      ? formatBuilderOperatorRepairReply({ ok: true, answer: result.answer, trace })
      : shouldExplain ? 'The job completed. See the recorded verification below.' : result.answer
    const reply = historyReply(await initialReply(baseReply, 'succeeded'), job.workspaceId, files)
    await finishBuilderJob({
      jobId: job.id,
      userId: job.userId,
      claimGeneration: job.claimGeneration,
      status: 'succeeded',
      reply,
      result: {
        jobId: job.id,
        workspaceId: job.workspaceId,
        status: 'succeeded',
        reply,
        files,
        trace,
      },
    })
    await recordBuilderUniversityProductionOutcome({
      job,
      status: verifiedBuilderCognitiveApplication(result) ? 'success' : 'observed',
      verification: verifiedBuilderCognitiveApplication(result)
        ? 'workspace_changed_and_host_proving_command_exit_zero'
        : 'terminal_builder_completion_without_learning_proof',
      facts: { successfulRuns: result.trace.filter(item => item.toolId === 'run' && item.ok).length },
    }).catch(outcomeError => console.error('[builder_university_outcome_record_failed]', {
      jobId: job.id,
      message: outcomeError instanceof Error ? outcomeError.message : 'unknown',
    }))
    await recordBuilderEpisode({
      job,
      outcome: 'succeeded',
      summary: reply,
      evidence: { files, successfulRuns: result.trace.filter(item => item.toolId === 'run' && item.ok).length, verification: 'workspace_changed_and_host_command_exit_zero' },
    }).catch(() => console.warn('[builder_episode_write_failed]', { jobId }))
    // Only after the generation-fenced terminal write; learning failure cannot undo task success.
    if (!plan) await workspace.recordJobRepairLesson(job.workspaceId, job.id, job.claimGeneration, result)
      .then(recorded => console.info('[builder_project_lesson_outcome]', { jobId, recorded, retrievedSignals: priorLessons.length }))
      .catch(() => console.warn('[builder_project_lesson_write_failed]', { jobId }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_job_failed'
    console.error('[builder_job_execution_failed]', { jobId, message })
    if (job) {
      const trace = lastTrace.length ? lastTrace : job.checkpoint?.trace || []
      if (await deferSelfHealingCapacity(job, message, trace).catch(deferError => {
        console.error('[builder_self_healing_capacity_defer_failed]', {
          jobId,
          message: deferError instanceof Error ? deferError.message : 'unknown',
        })
        return false
      })) return
      await terminalFailure(job, message === BUILDER_TURN_TIMEOUT_ERROR ? BUILDER_TURN_TIMEOUT_ERROR : message, trace).catch(finishError => {
        console.error('[builder_job_terminal_persist_failed]', {
          jobId,
          message: finishError instanceof Error ? finishError.message : 'unknown',
        })
      })
    }
  }
}


/**
 * Mandatory Platform Harness ingress for every durable Builder execution.
 * A durable job never inherits the interactive COS turn deadline of the request that queued it
 * (Next.js after() snapshots that context); its only clock is this Harness deadline.
 */
export async function runBuilderJob(jobId: string, userId: string): Promise<void> {
  return runWithoutTurnDeadline(() => withHostProductionHarnessIngress({
    objective: `Execute durable Builder job ${jobId}`,
    portableId: 'cos-builder',
    agentId: 'cos-builder-worker',
    role: 'software_specialist',
    capabilityId: 'builder.job.execute',
    risk: 'write',
    deadlineMs: 300_000,
    maxConcurrency: 1,
    maxToolCalls: 200,
    maxCostUsd: deepInfraMaxRunUsd('builder'),
    runId: `builder-job-${jobId}`,
  }, () => runBuilderJobInsideHarness(jobId, userId)))
}