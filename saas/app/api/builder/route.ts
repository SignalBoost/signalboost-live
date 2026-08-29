import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { BuilderToolLoop } from '@/lib/builder/tool-loop'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { VercelSandboxBuilderRunner } from '@/lib/builder/vercel-sandbox-runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanObjective(value: unknown): string {
  const objective = String(value || '').trim()
  if (!objective || objective.length > 8_000) throw new Error('builder_invalid_objective')
  return objective
}

function publicTrace(trace: readonly { round: number; toolId: string; ok: boolean; error?: string }[]) {
  return trace.map(({ round, toolId, ok, error }) => ({ round, toolId, ok, ...(error ? { error } : {}) }))
}

export async function GET(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to use COS Builder.' }, { status: 401 })
  const workspace = createSupabaseBuilderWorkspace(access.userId)
  if (!workspace) return NextResponse.json({ error: 'Builder storage is unavailable.' }, { status: 503 })
  const workspaceId = new URL(request.url).searchParams.get('workspaceId') || ''
  if (!workspaceId) return NextResponse.json({ workspaces: await workspace.listWorkspaces() })
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

    const suppliedFiles = Array.isArray(body?.files) ? body.files : []
    if (suppliedFiles.length > 20) return NextResponse.json({ error: 'Too many files in one request.' }, { status: 400 })
    for (const file of suppliedFiles) await workspace.writeFile(workspaceId, String(file?.path || ''), String(file?.content ?? ''))

    const result = await new BuilderToolLoop(
      createPlatformAiPort(),
      workspace,
      new VercelSandboxBuilderRunner(),
    ).run({ objective, workspaceId })

    const files = (await workspace.listFiles(workspaceId)).map(file => file.path)
    if (result.ok === false) return NextResponse.json({ error: result.error, workspaceId, files, trace: publicTrace(result.trace) }, { status: 422 })
    return NextResponse.json({ workspaceId, reply: result.answer, files, trace: publicTrace(result.trace) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_request_failed'
    const status = /^builder_(invalid|file_limit|file_too_large|invalid_path)/.test(message) ? 400 : 502
    return NextResponse.json({ error: message }, { status })
  }
}