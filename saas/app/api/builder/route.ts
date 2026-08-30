import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { BuilderToolLoop } from '@/lib/builder/tool-loop'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { VercelSandboxBuilderRunner } from '@/lib/builder/vercel-sandbox-runner'
import { verifiedRepairLesson } from '@/lib/builder/verified-lessons'
import { inferBuilderCertificationAttempt } from '@/lib/builder/certification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanObjective(value: unknown): string {
  const objective = String(value || '').trim()
  if (!objective || objective.length > 8_000) throw new Error('builder_invalid_objective')
  return objective
}

function publicTrace(trace: readonly { round: number; toolId: string; ok: boolean; input: Record<string, unknown>; output?: unknown; error?: string; failureClass?: string; remediation?: string }[]) {
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

/** Authenticated Builder only. Public Concierge must never route code execution here. */
export async function POST(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to use COS Builder.' }, { status: 401 })

  try {
    const body = await request.json()
    const objective = cleanObjective(body?.objective)
    const requestedWorkspaceId = String(body?.workspaceId || '').trim()
    if (requestedWorkspaceId && !UUID.test(requestedWorkspaceId)) return NextResponse.json({ error: 'Invalid workspace id.' }, { status: 400 })
    const workspaceId = requestedWorkspaceId || crypto.randomUUID()
    const workspace = createSupabaseBuilderWorkspace(access.userId)
    if (!workspace) return NextResponse.json({ error: 'Builder storage is unavailable.' }, { status: 503 })
    await workspace.ensureWorkspace(workspaceId)
    await workspace.setObjective(workspaceId, objective)

    const suppliedFiles = Array.isArray(body?.files) ? body.files : []
    if (suppliedFiles.length > 20) return NextResponse.json({ error: 'Too many files in one request.' }, { status: 400 })
    for (const file of suppliedFiles) await workspace.writeFile(workspaceId, String(file?.path || ''), String(file?.content ?? ''))

    const priorLessons = await workspace.fetchVerifiedRepairLessons().catch(error => {
      console.error('[builder_verified_lesson_read_failed]', { message: error instanceof Error ? error.message : 'unknown' })
      return []
    })

    const result = await new BuilderToolLoop(
      createPlatformAiPort(),
      workspace,
      new VercelSandboxBuilderRunner(),
    ).run({ objective, workspaceId, priorLessons })

    const files = (await workspace.listFiles(workspaceId)).map(file => file.path)
    if (result.ok === false) return NextResponse.json({ error: result.error, workspaceId, files, trace: publicTrace(result.trace) }, { status: 422 })
    const lesson = verifiedRepairLesson(result)
    // Learning persistence must never turn an otherwise verified repair into a failed user task.
    if (lesson) await workspace.recordVerifiedRepairLesson(workspaceId, lesson).catch(error => {
      console.error('[builder_verified_lesson_write_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })
    const certification = inferBuilderCertificationAttempt(result)
    if (certification) await workspace.recordCertificationAttempt(workspaceId, certification).catch(error => {
      console.error('[builder_certification_write_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })
    return NextResponse.json({ workspaceId, reply: result.answer, files, trace: publicTrace(result.trace) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_request_failed'
    const status = /^builder_(invalid|file_limit|file_too_large|invalid_path)/.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
