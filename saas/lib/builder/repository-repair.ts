import { createPlatformAiPort } from '../cos/aiPort.ts'
import { BuilderToolLoop } from './tool-loop.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { verifiedRepairLesson } from './verified-lessons.ts'
import { inferBuilderCertificationAttempt } from './certification.ts'
import { parseSignalBoostRepositoryRepairTarget, resolveSignalBoostRepositoryCommit, signalBoostRepositoryRepairObjective } from './repository-repair-target.ts'
import { VercelRepositoryRepairSession } from './vercel-repository-repair-session.ts'
import type { BuilderToolTrace } from './contracts.ts'

export type SignalBoostRepositoryRepairExecution = Readonly<{
  status: number
  payload: Record<string, unknown>
}>

function publicTrace(trace: readonly BuilderToolTrace[]) {
  return trace.map(({ round, toolId, ok, input, output, error, failureClass, remediation }) => {
    const base = { round, toolId, ok, ...(error ? { error } : {}), ...(failureClass ? { failureClass } : {}), ...(remediation ? { remediation } : {}) }
    if (toolId !== 'run') return { ...base, ...(typeof input.path === 'string' ? { path: input.path.slice(0, 240) } : {}) }
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

function failedPayload(input: {
  error: string
  workspaceId: string
  files: readonly string[]
  trace: readonly BuilderToolTrace[]
  baseCommitSha: string | null
}): SignalBoostRepositoryRepairExecution {
  return Object.freeze({
    status: 422,
    payload: {
      error: input.error,
      source: 'cos-platform-engineer',
      workspaceId: input.workspaceId,
      files: input.files,
      trace: publicTrace(input.trace),
      execution_allowed: true,
      repository_write_allowed: false,
      merge_allowed: false,
      base_commit_sha: input.baseCommitSha,
    },
  })
}

export async function executeSignalBoostRepositoryRepair(input: {
  userId: string
  rawObjective: string
  workspaceId: string
}): Promise<SignalBoostRepositoryRepairExecution | null> {
  const parsed = parseSignalBoostRepositoryRepairTarget(input.rawObjective)
  if (!parsed) return null
  const target = await resolveSignalBoostRepositoryCommit(parsed)
  const workspace = createSupabaseBuilderWorkspace(input.userId)
  if (!workspace) return Object.freeze({ status: 503, payload: { error: 'Builder storage is unavailable.' } })

  const objective = signalBoostRepositoryRepairObjective(target)
  await workspace.ensureWorkspace(input.workspaceId)
  await workspace.setObjective(input.workspaceId, objective)
  const priorLessons = await workspace.fetchVerifiedRepairLessons().catch(error => {
    console.error('[builder_repository_lesson_read_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    return []
  })

  let session: VercelRepositoryRepairSession | null = null
  try {
    session = await VercelRepositoryRepairSession.create(target)
    const result = await new BuilderToolLoop(createPlatformAiPort(), session, session).run({
      objective,
      workspaceId: input.workspaceId,
      priorLessons,
      maxRounds: 6,
      modelRoundTimeoutMs: 35_000,
    })
    const changes = await session.collectChanges()
    const patchPresent = Boolean(changes.patch.trim())
    const patchPath = result.ok && patchPresent ? 'repository-repair.patch' : 'repository-repair-unverified.patch'
    if (patchPresent) await workspace.writeFile(input.workspaceId, patchPath, changes.patch)
    for (const file of changes.files) await workspace.writeFile(input.workspaceId, `repository/${file.path}`, file.content)
    const files = (await workspace.listFiles(input.workspaceId)).map(file => file.path)

    if (!result.ok) {
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

    return Object.freeze({
      status: 200,
      payload: {
        source: 'cos-platform-engineer',
        workspaceId: input.workspaceId,
        reply: `${result.answer}\n\nA reviewable patch was created from pinned commit ${target.fullCommitSha}. Nothing was committed, merged, or deployed.`,
        files,
        trace: publicTrace(result.trace),
        execution_allowed: true,
        repository_write_allowed: false,
        merge_allowed: false,
        base_commit_sha: target.fullCommitSha,
        branch: target.branch,
      },
    })
  } finally {
    await session?.close()
  }
}
