// saas/app/api/builder/route.ts
import { after, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { isPastedOperationalLog, operationalLogReply } from '@/lib/ai/cos/pastedOperationalLog'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'
import { planDebugFileJob, type DebugFileInput } from '@/lib/builder/debug-file-job'
import { enqueueBuilderJob, getBuilderJobForUser } from '@/lib/builder/job-store'
import { runBuilderJob } from '@/lib/builder/job-runner'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_JOB_FILES = 20
const DEBUG_OBJECTIVE = /\b(?:debug|fix|repair|troubleshoot|correct)\b|\b(?:does not work|doesn't work|broken|failing|throws?)\b/i

function cleanObjective(value: unknown): string {
  const objective = String(value || '').trim()
  if (!objective || objective.length > 8_000) throw new Error('builder_invalid_objective')
  return objective
}

function noStore(payload: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(payload, init)
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}

function cleanFiles(value: unknown): DebugFileInput[] {
  if (!Array.isArray(value)) return []
  if (value.length > MAX_JOB_FILES) throw new Error('builder_file_limit')
  return value.map(file => ({
    path: String(file?.path || ''),
    content: String(file?.content ?? ''),
  }))
}

function runningReply(jobId: string): string {
  return `COS Builder is running job ${jobId}. Progress and the final result are durable in History; the action will not be replayed.`
}

async function persistSynchronousReply(input: {
  conversationId: string
  userId: string
  objective: string
  reply: string
}): Promise<void> {
  if (!UUID.test(input.conversationId)) return
  await persistTurn({
    conversationId: input.conversationId,
    userId: input.userId,
    userMessage: input.objective,
    assistantReply: input.reply,
  })
}

export async function GET(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return noStore({ error: 'Sign in to use COS Builder.' }, { status: 401 })

  const url = new URL(request.url)
  const jobId = url.searchParams.get('jobId') || ''
  if (jobId) {
    if (!UUID.test(jobId)) return noStore({ error: 'Invalid job id.' }, { status: 400 })
    try {
      const job = await getBuilderJobForUser(jobId, access.userId)
      if (!job) return noStore({ error: 'Builder job not found.' }, { status: 404 })
      if (job.status === 'queued' || job.status === 'running') {
        return noStore({
          jobId: job.id,
          workspaceId: job.workspaceId,
          status: job.status,
          reply: runningReply(job.id),
        }, { status: 202 })
      }
      return noStore({
        ...(job.result || {}),
        jobId: job.id,
        workspaceId: job.workspaceId,
        status: job.status,
        ...(job.error ? { error: job.error } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'builder_job_read_failed'
      return noStore({ error: message }, { status: 500 })
    }
  }

  const workspace = createSupabaseBuilderWorkspace(access.userId)
  if (!workspace) return noStore({ error: 'Builder storage is unavailable.' }, { status: 503 })
  const workspaceId = url.searchParams.get('workspaceId') || ''
  if (!workspaceId) {
    const [workspaces, certification] = await Promise.all([
      workspace.listWorkspaces(),
      workspace.certificationSummary().catch(() => ({ earnedLevel: 0, attempts: 0 })),
    ])
    return noStore({ workspaces, certification })
  }
  if (!UUID.test(workspaceId)) return noStore({ error: 'Invalid workspace id.' }, { status: 400 })
  try {
    const files = (await workspace.listFiles(workspaceId)).map(file => file.path)
    return noStore({ workspaceId, files })
  } catch {
    return noStore({ error: 'Workspace not found.' }, { status: 404 })
  }
}

/**
 * Create one durable Builder job. The request returns after workspace/job persistence; execution is
 * scheduled with Next.js `after()`. GET polling is read-only and a lost response never replays POST.
 */
export async function POST(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return noStore({ error: 'Sign in to use COS Builder.' }, { status: 401 })

  let conversationId = ''
  let objective = ''
  try {
    const body = await request.json()
    objective = cleanObjective(body?.objective)
    conversationId = String(body?.conversationId || '').trim() || crypto.randomUUID()
    if (!UUID.test(conversationId)) return noStore({ error: 'Invalid conversation id.' }, { status: 400 })
    const requestedWorkspaceId = String(body?.workspaceId || '').trim()
    if (requestedWorkspaceId && !UUID.test(requestedWorkspaceId)) {
      return noStore({ error: 'Invalid workspace id.' }, { status: 400 })
    }
    const workspaceId = requestedWorkspaceId || crypto.randomUUID()

    // Build/runtime logs are evidence to analyze, never permission to clone, edit, or execute a
    // repository. This is the same deterministic gate used by Concierge.
    if (isPastedOperationalLog(objective)) {
      const reply = operationalLogReply(objective)
      await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
      return noStore({
        reply,
        source: 'builder-operational-log-analysis',
        execution_allowed: false,
        external_action_taken: false,
        files: [],
        trace: [],
      })
    }

    const files = cleanFiles(body?.files)
    const debugPlan = planDebugFileJob(objective, files)
    if (files.length > 0 && DEBUG_OBJECTIVE.test(objective) && !debugPlan) {
      const reply = 'COS Builder debug jobs require exactly one supported .js, .mjs, .cjs, .ts, .mts, .cts, or .py attachment no larger than 128 KiB. No code was run.'
      await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
      return noStore({
        error: 'builder_debug_attachment_required',
        reply,
        execution_allowed: false,
        files: [],
        trace: [],
      }, { status: 400 })
    }

    const workspace = createSupabaseBuilderWorkspace(access.userId)
    if (!workspace) {
      const reply = 'COS Builder storage is unavailable. No code was run.'
      await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
      return noStore({ error: 'Builder storage is unavailable.', reply }, { status: 503 })
    }

    await workspace.ensureWorkspace(workspaceId)
    await workspace.setObjective(workspaceId, objective)
    for (const file of files) await workspace.writeFile(workspaceId, file.path, file.content)

    const jobId = crypto.randomUUID()
    const reply = runningReply(jobId)
    await enqueueBuilderJob({
      jobId,
      workspaceId,
      userId: access.userId,
      conversationId,
      objective,
      jobKind: debugPlan ? 'debug_file' : 'standard',
      metadata: debugPlan
        ? {
            debugPath: debugPlan.path,
            debugCommand: debugPlan.command,
            debugRuntime: debugPlan.runtime,
          }
        : {},
      ownerAuthorized: access.isOwner === true,
      runningReply: reply,
    })

    after(async () => {
      await runBuilderJob(jobId, access.userId)
    })

    return noStore({
      jobId,
      workspaceId,
      status: 'queued',
      reply,
    }, { status: 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_request_failed'
    const status = /^builder_(invalid|file_limit|file_too_large|invalid_path|debug_attachment_required)/.test(message) ? 400 : 502
    const reply = `COS Builder stopped: ${message}`
    await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
    return noStore({ error: message, reply }, { status })
  }
}
