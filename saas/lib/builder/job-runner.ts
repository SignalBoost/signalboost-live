import { builderRunSourceEvidence } from './source-evidence.ts'
import { builderPendingWriteEvidence } from './evidence-events.ts'
// lib/builder/job-runner.ts
import { createBuilderCodingAiPort } from '../cos/aiPort.ts'
import { BUILDER_TURN_TIMEOUT_ERROR, createGovernedBuilderAiPort } from './control-adapter.ts'
import type { BuilderToolTrace } from './contracts.ts'
import { runDebugFileJob, type DebugFilePlan } from './debug-file-job.ts'
import { finishBuilderJob, claimBuilderJob, pauseBuilderJob, readBuilderWorkspaceFingerprint, type BuilderJobRecord } from './job-store.ts'
import { formatBuilderOperatorRepairReply } from './operator-narration.ts'
import { builderNextAction } from './user-guidance.ts'
import { isRepairObjective } from './regression-gate.ts'
import { formatBuilderExecutionEvidence } from './execution-evidence.ts'
import { explainInitialBuilderRepair } from './explain-evidence.ts'
import { BuilderToolLoop } from './tool-loop.ts'
import { VercelSandboxBuilderRunner } from './vercel-sandbox-runner.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { executeSignalBoostRepositoryRepair } from './repository-repair.ts'
import { parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget } from './repository-repair-target.ts'
import { builderAutoMergeSnapshotPort } from './repository-repair-snapshot-host.ts'
import { retrieveValidatedCognitiveSkills, type CognitiveSkillContextResult } from '@/lib/ai/cos/cognitiveSkillContext'
import { recordVerifiedCognitiveProductionOutcome } from '@/lib/ai/cos/cognitiveProductionOutcome'
import { verifiedBuilderCognitiveApplication } from './cognitive-application.ts'

const BUILDER_JOB_BUDGET_MS = 260_000
const BUILDER_JOB_RESULT_RESERVE_MS = 20_000

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
  const files = workspace
    ? await workspace.listFiles(job.workspaceId).then(items => items.map(item => item.path)).catch(() => [])
    : []
  const reply = historyReply(`${repairAwareFailureReply(job, error, safeTrace)}\n\n${builderNextAction(error, trace)}`, job.workspaceId, files)
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
}

/**
 * Execute one already-enqueued Builder job. The atomic claim makes duplicate invocations harmless;
 * the browser never replays POST and polling GET has no execution authority.
 */
export async function runBuilderJob(jobId: string, userId: string): Promise<void> {
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

    if (job.metadata.platformRepair === true) {
      if (!job.ownerAuthorized) {
        await terminalFailure(job, 'builder_repository_repair_owner_required')
        return
      }
      const exactTarget = parseSignalBoostRepositoryRepairTarget(job.objective)
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
        rawObjective: job.objective,
        workspaceId: job.workspaceId,
        target,
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

    const sliceStartedAtMs = Date.now()
    const deadlineAtMs = Date.now() + BUILDER_JOB_BUDGET_MS
    const ai = createGovernedBuilderAiPort(createBuilderCodingAiPort(), {
      deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
    })
    const runner = new VercelSandboxBuilderRunner()
    const plan = debugPlan(job)
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
        })
      : await new BuilderToolLoop(ai, workspace, runner).run({
          objective: job.objective,
          workspaceId: job.workspaceId,
          priorLessons,
          cognitiveSkills: cognitive.items,
          projectContext: job.metadata.projectContext,
          checkpoint: job.checkpoint,
          // Leave room for a slow model round, then a bounded sandbox command and persistence.
          shouldPause: (beforeTool = false) => Date.now() - sliceStartedAtMs >= (beforeTool ? 150_000 : 100_000),
          maxRounds: 96,
          deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
          modelRoundTimeoutMs: 55_000,
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
      return
    }


    if (verifiedBuilderCognitiveApplication(result)) {
      const successfulRuns = result.trace.filter(item => item.toolId === 'run' && item.ok).length
      await recordAppliedCognitiveSkills(job, cognitive.items.map(item => item.skillKey), successfulRuns)
    }

    const baseReply = isRepairObjective(job.objective)
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
    // Only after the generation-fenced terminal write; learning failure cannot undo task success.
    if (!plan) await workspace.recordJobRepairLesson(job.workspaceId, job.id, job.claimGeneration, result)
      .then(recorded => console.info('[builder_project_lesson_outcome]', { jobId, recorded, retrievedSignals: priorLessons.length }))
      .catch(() => console.warn('[builder_project_lesson_write_failed]', { jobId }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_job_failed'
    console.error('[builder_job_execution_failed]', { jobId, message })
    if (job) {
      await terminalFailure(job, message === BUILDER_TURN_TIMEOUT_ERROR ? BUILDER_TURN_TIMEOUT_ERROR : message, lastTrace.length ? lastTrace : job.checkpoint?.trace || []).catch(finishError => {
        console.error('[builder_job_terminal_persist_failed]', {
          jobId,
          message: finishError instanceof Error ? finishError.message : 'unknown',
        })
      })
    }
  }
}
