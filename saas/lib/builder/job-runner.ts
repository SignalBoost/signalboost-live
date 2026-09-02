import { createPlatformAiPort } from '../cos/aiPort.ts'
import { BUILDER_TURN_TIMEOUT_ERROR, createGovernedBuilderAiPort } from './control-adapter.ts'
import type { BuilderToolTrace } from './contracts.ts'
import { runDebugFileJob, type DebugFilePlan } from './debug-file-job.ts'
import { finishBuilderJob, claimBuilderJob, type BuilderJobRecord } from './job-store.ts'
import { isRepairObjective } from './regression-gate.ts'
import { BuilderToolLoop } from './tool-loop.ts'
import { VercelSandboxBuilderRunner } from './vercel-sandbox-runner.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { executeSignalBoostRepositoryRepair } from './repository-repair.ts'
import { parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget } from './repository-repair-target.ts'

const BUILDER_JOB_BUDGET_MS = 260_000
const BUILDER_JOB_RESULT_RESERVE_MS = 20_000

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
        ...(typeof input.path === 'string' ? { path: input.path.slice(0, 240) } : {}),
        ...telemetry,
      }
    }
    const result = output && typeof output === 'object' ? output as Record<string, unknown> : {}
    return {
      ...base,
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
  if (!path || !command) return null
  return Object.freeze({ path, command, runtime })
}

function oneLine(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(-500)
}

function failureReply(error: string, trace: ReturnType<typeof publicTrace>): string {
  const tail = trace.slice(-5).map((entry: any) => {
    const parts = [`#${entry.round ?? '?'} ${entry.toolId || 'tool'} ${entry.ok ? 'ok' : 'failed'}`]
    if (typeof entry.exitCode === 'number') parts.push(`exit ${entry.exitCode}`)
    if (entry.command) parts.push(`$ ${oneLine(entry.command).slice(0, 180)}`)
    if (entry.error) parts.push(oneLine(entry.error))
    const stream = oneLine(entry.stderr) || oneLine(entry.stdout)
    if (stream) parts.push(stream)
    return `  ${parts.join(' · ')}`
  })
  return `COS Builder stopped: ${error}${tail.length ? `\n\nBuilder evidence:\n${tail.join('\n')}` : ''}`
}

function historyReply(reply: string, workspaceId: string, files: readonly string[]): string {
  const links = files.slice(0, 20).map(path => {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const label = path.replace(/[\[\]]/g, '')
    return `- [Download ${label}](/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${encodedPath})`
  })
  return links.length ? `${reply.trim()}\n\nBuilder files:\n${links.join('\n')}` : reply.trim()
}

async function terminalFailure(job: BuilderJobRecord, error: string, trace: readonly BuilderToolTrace[] = []): Promise<void> {
  const safeTrace = publicTrace(trace)
  const workspace = createSupabaseBuilderWorkspace(job.userId)
  const files = workspace
    ? await workspace.listFiles(job.workspaceId).then(items => items.map(item => item.path)).catch(() => [])
    : []
  const reply = historyReply(failureReply(error, safeTrace), job.workspaceId, files)
  await finishBuilderJob({
    jobId: job.id,
    userId: job.userId,
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
  try {
    job = await claimBuilderJob(jobId, userId)
    if (!job) return

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
      })
      if (!execution) {
        await terminalFailure(job, 'builder_repository_repair_target_unavailable')
        return
      }
      const payload = execution.payload
      const error = typeof payload.error === 'string' ? payload.error : null
      const reply = typeof payload.reply === 'string'
        ? payload.reply
        : failureReply(error || 'builder_repository_repair_failed', Array.isArray(payload.trace) ? payload.trace as any : [])
      await finishBuilderJob({
        jobId: job.id,
        userId: job.userId,
        status: execution.status >= 200 && execution.status < 300 && !error ? 'succeeded' : 'failed',
        reply,
        ...(error ? { error } : {}),
        result: { ...payload, jobId: job.id, workspaceId: job.workspaceId },
      })
      return
    }

    const workspace = createSupabaseBuilderWorkspace(job.userId)
    if (!workspace) {
      await terminalFailure(job, 'builder_job_storage_unavailable')
      return
    }

    const deadlineAtMs = Date.now() + BUILDER_JOB_BUDGET_MS
    const ai = createGovernedBuilderAiPort(createPlatformAiPort(), {
      deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
    })
    const runner = new VercelSandboxBuilderRunner()
    const plan = debugPlan(job)
    const result = plan
      ? await runDebugFileJob({
          objective: job.objective,
          workspaceId: job.workspaceId,
          plan,
          workspace,
          runner,
          ai,
        })
      : await new BuilderToolLoop(ai, workspace, runner).run({
          objective: job.objective,
          workspaceId: job.workspaceId,
          // Coding turns intentionally skip cognitive-skill / verified-lesson retrieval. The job
          // is grounded only in its workspace, current tool evidence, and the user's objective.
          priorLessons: [],
          maxRounds: isRepairObjective(job.objective) ? 6 : 5,
          // Production Qwen control rounds with repository evidence have been observed just above
          // 35s. Keep the round bounded, but leave enough room for a valid 36–45s completion.
          modelRoundTimeoutMs: 55_000,
        })

    const files = (await workspace.listFiles(job.workspaceId)).map(file => file.path)
    const trace = publicTrace(result.trace)
    if (result.ok === false) {
      const reply = historyReply(failureReply(result.error, trace), job.workspaceId, files)
      await finishBuilderJob({
        jobId: job.id,
        userId: job.userId,
        status: 'failed',
        reply,
        error: result.error,
        result: {
          jobId: job.id,
          workspaceId: job.workspaceId,
          status: 'failed',
          error: result.error,
          reply,
          files,
          trace,
        },
      })
      return
    }

    const reply = historyReply(result.answer, job.workspaceId, files)
    await finishBuilderJob({
      jobId: job.id,
      userId: job.userId,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_job_failed'
    console.error('[builder_job_execution_failed]', { jobId, message })
    if (job) {
      await terminalFailure(job, message === BUILDER_TURN_TIMEOUT_ERROR ? BUILDER_TURN_TIMEOUT_ERROR : message).catch(finishError => {
        console.error('[builder_job_terminal_persist_failed]', {
          jobId,
          message: finishError instanceof Error ? finishError.message : 'unknown',
        })
      })
    }
  }
}
