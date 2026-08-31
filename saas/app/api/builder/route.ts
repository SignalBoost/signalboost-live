// saas/app/api/builder/route.ts
import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { BuilderToolLoop } from '@/lib/builder/tool-loop'
import { isRepairObjective } from '@/lib/builder/regression-gate'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { VercelSandboxBuilderRunner } from '@/lib/builder/vercel-sandbox-runner'
import { verifiedRepairLesson } from '@/lib/builder/verified-lessons'
import { inferBuilderCertificationAttempt } from '@/lib/builder/certification'
import { isPastedOperationalLog, operationalLogReply } from '@/lib/ai/cos/pastedOperationalLog'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'
import { executeSignalBoostRepositoryRepair } from '@/lib/builder/repository-repair'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanObjective(value: unknown): string {
  const objective = String(value || '').trim()
  if (!objective || objective.length > 8_000) throw new Error('builder_invalid_objective')
  return objective
}

function builderHistoryReply(reply: string, workspaceId: string, files: readonly string[]): string {
  const links = workspaceId
    ? files
        .filter((path): path is string => typeof path === 'string' && path.length > 0)
        .slice(0, 20)
        .map((path) => {
          const encodedPath = path.split('/').map(encodeURIComponent).join('/')
          const label = path.replace(/[\[\]]/g, '')
          return `- [Download ${label}](/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${encodedPath})`
        })
    : []
  return links.length > 0 ? `${reply.trim()}\n\nBuilder files:\n${links.join('\n')}` : reply.trim()
}

async function persistBuilderTurn(input: {
  conversationId: string
  userId: string
  objective: string
  reply: string
  workspaceId: string
  files: readonly string[]
}): Promise<void> {
  if (!UUID.test(input.conversationId) || !input.objective.trim() || !input.reply.trim()) return
  await persistTurn({
    conversationId: input.conversationId,
    userId: input.userId,
    userMessage: input.objective,
    assistantReply: builderHistoryReply(input.reply, input.workspaceId, input.files),
  })
}

function publicTrace(trace: readonly { round: number; toolId: string; ok: boolean; input: Record<string, unknown>; output?: unknown; error?: string; failureClass?: string; remediation?: string }[]) {
  return trace.map(({ round, toolId, ok, input, output, error, failureClass, remediation }) => {
    const base = { round, toolId, ok, ...(error ? { error } : {}), ...(failureClass ? { failureClass } : {}), ...(remediation ? { remediation } : {}) }
    if (toolId !== 'run') {
      const shape = output && typeof output === 'object' ? output as Record<string, unknown> : {}
      const telemetry = toolId === 'model_control'
        ? Object.fromEntries(
            (['responseLength', 'startsWithObject', 'endsWithObject', 'hasThinkOpen', 'hasThinkClose', 'hasUnclosedObject', 'anyValidJson'] as const)
              .filter((key) => typeof shape[key] === 'number' || typeof shape[key] === 'boolean')
              .map((key) => [key, shape[key]]),
          )
        : {}
      return { ...base, ...(typeof input.path === 'string' ? { path: input.path.slice(0, 240) } : {}), ...telemetry }
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

export async function GET(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to use COS Builder.' }, { status: 401 })
  const workspace = createSupabaseBuilderWorkspace(access.userId)
  if (!workspace) return NextResponse.json({ error: 'Builder storage is unavailable.' }, { status: 503 })
  const workspaceId = new URL(request.url).searchParams.get('workspaceId') || ''
  if (!workspaceId) {
    const [workspaces, certification] = await Promise.all([
      workspace.listWorkspaces(),
      workspace.certificationSummary().catch(() => ({ earnedLevel: 0, attempts: 0 })),
    ])
    return NextResponse.json({ workspaces, certification })
  }
  if (!UUID.test(workspaceId)) return NextResponse.json({ error: 'Invalid workspace id.' }, { status: 400 })
  try {
    const files = (await workspace.listFiles(workspaceId)).map(file => file.path)
    return NextResponse.json({ workspaceId, files })
  } catch {
    return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
  }
}

/**
 * Authenticated Builder only. The browser ingress may call this route for an owner before entering
 * public-delivery isolation; ordinary public Concierge execution never receives Builder authority.
 */
export async function POST(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to use COS Builder.' }, { status: 401 })

  let conversationId = ''
  let rawObjective = ''
  let workspaceId = ''

  try {
    const body = await request.json()
    rawObjective = String(body?.objective || '').trim()
    conversationId = String(body?.conversationId || '').trim()
    if (conversationId && !UUID.test(conversationId)) return NextResponse.json({ error: 'Invalid conversation id.' }, { status: 400 })
    const requestedWorkspaceId = String(body?.workspaceId || '').trim()
    if (requestedWorkspaceId && !UUID.test(requestedWorkspaceId)) return NextResponse.json({ error: 'Invalid workspace id.' }, { status: 400 })
    workspaceId = requestedWorkspaceId || crypto.randomUUID()

    if (isPastedOperationalLog(rawObjective)) {
      if (access.isOwner) {
        const repair = await executeSignalBoostRepositoryRepair({
          userId: access.userId,
          rawObjective,
          workspaceId,
        })
        if (repair) {
          const payload = repair.payload as Record<string, unknown>
          const files = Array.isArray(payload.files)
            ? payload.files.filter((value): value is string => typeof value === 'string').slice(0, 50)
            : []
          const reply = typeof payload.reply === 'string'
            ? payload.reply
            : `COS Builder stopped: ${String(payload.error || 'builder_request_failed')}`
          await persistBuilderTurn({ conversationId, userId: access.userId, objective: rawObjective, reply, workspaceId, files })
          return NextResponse.json(repair.payload, { status: repair.status })
        }
      }
      const reply = operationalLogReply(rawObjective)
      await persistBuilderTurn({ conversationId, userId: access.userId, objective: rawObjective, reply, workspaceId, files: [] })
      return NextResponse.json({
        reply,
        source: 'builder-operational-log-analysis',
        files: [],
        trace: [],
        execution_allowed: false,
      })
    }

    const objective = cleanObjective(rawObjective)
    const workspace = createSupabaseBuilderWorkspace(access.userId)
    if (!workspace) {
      const reply = 'COS Builder stopped: Builder storage is unavailable.'
      await persistBuilderTurn({ conversationId, userId: access.userId, objective, reply, workspaceId, files: [] })
      return NextResponse.json({ error: 'Builder storage is unavailable.' }, { status: 503 })
    }
    await workspace.ensureWorkspace(workspaceId)
    await workspace.setObjective(workspaceId, objective)

    const suppliedFiles = Array.isArray(body?.files) ? body.files : []
    if (suppliedFiles.length > 20) {
      const reply = 'COS Builder stopped: Too many files in one request.'
      await persistBuilderTurn({ conversationId, userId: access.userId, objective, reply, workspaceId, files: [] })
      return NextResponse.json({ error: 'Too many files in one request.' }, { status: 400 })
    }
    for (const file of suppliedFiles) await workspace.writeFile(workspaceId, String(file?.path || ''), String(file?.content ?? ''))

    const priorLessons = await workspace.fetchVerifiedRepairLessons().catch(error => {
      console.error('[builder_verified_lesson_read_failed]', { message: error instanceof Error ? error.message : 'unknown' })
      return []
    })

    const result = await new BuilderToolLoop(
      createPlatformAiPort(),
      workspace,
      new VercelSandboxBuilderRunner(),
    ).run({
      objective,
      workspaceId,
      priorLessons,
      // A new design should complete after its first verified workspace proof, rather than
      // consuming the full repair-oriented control-loop budget.
      maxRounds: isRepairObjective(objective) ? 8 : 6,
      modelRoundTimeoutMs: 40_000,
    })

    const files = (await workspace.listFiles(workspaceId)).map(file => file.path)
    if (result.ok === false) {
      const trace = publicTrace(result.trace)
      const reply = `COS Builder stopped: ${result.error}`
      await persistBuilderTurn({ conversationId, userId: access.userId, objective, reply, workspaceId, files })
      return NextResponse.json({ error: result.error, workspaceId, files, trace }, { status: 422 })
    }
    const lesson = verifiedRepairLesson(result)
    // Learning persistence must never turn an otherwise verified repair into a failed user task.
    if (lesson) await workspace.recordVerifiedRepairLesson(workspaceId, lesson).catch(error => {
      console.error('[builder_verified_lesson_write_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })
    const certification = inferBuilderCertificationAttempt(result)
    if (certification) await workspace.recordCertificationAttempt(workspaceId, certification).catch(error => {
      console.error('[builder_certification_write_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })
    const trace = publicTrace(result.trace)
    await persistBuilderTurn({ conversationId, userId: access.userId, objective, reply: result.answer, workspaceId, files })
    return NextResponse.json({ workspaceId, reply: result.answer, files, trace })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_request_failed'
    const status = /^builder_(invalid|file_limit|file_too_large|invalid_path)/.test(message) ? 400 : 502
    const reply = `COS Builder stopped: ${message}`
    await persistBuilderTurn({ conversationId, userId: access.userId, objective: rawObjective, reply, workspaceId, files: [] })
    return NextResponse.json({ error: message }, { status })
  }
}
