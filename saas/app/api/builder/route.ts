// saas/app/api/builder/route.ts
import { after, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { isOperationalLogEvidence, isPastedOperationalLog } from '@/lib/ai/cos/pastedOperationalLog'
import { isConciergeBuilderObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'
import { planDebugFileJob, type DebugFileInput } from '@/lib/builder/debug-file-job'
import { enqueueBuilderJob, getBuilderJobForUser } from '@/lib/builder/job-store'
import { runBuilderJob } from '@/lib/builder/job-runner'
import { signalBoostDeployedRepairTarget } from '@/lib/builder/repository-repair-target'
import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import {
  isBuilderObjectiveError,
  readBuilderObjective,
  type BuilderObjectiveFailureCode,
} from '@/lib/builder/request-contract'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_JOB_FILES = 20
const DEBUG_OBJECTIVE = /\b(?:debug|fix|repair|troubleshoot|correct)\b|\b(?:does not work|doesn't work|broken|failing|throws?)\b/i
const SIGNALBOOST_OPERATIONAL_TARGET = /\b(?:signalboost-live|(?:saas\.)?signalboostapp\.com)\b/i

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

function objectiveFailureReply(code: BuilderObjectiveFailureCode): string {
  if (code === 'builder_objective_too_large') {
    return 'The Builder request exceeds the 512,000-character intake safety limit. No workspace or job was created. Attach the source file and send the relevant objective and diagnostic evidence.'
  }
  return 'COS Builder did not receive a usable coding instruction. No workspace or job was created. Send the objective again with the source file or concrete code reference.'
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
 *
 * A pasted log is debugging evidence and now produces a real job. Repository scope stays in the
 * separate owner-only Platform Engineer lane below, pinned to the immutable deployed revision;
 * ordinary log-derived work only ever acts inside the caller's own workspace sandbox.
 */
export async function POST(request: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return noStore({ error: 'Sign in to use COS Builder.' }, { status: 401 })

  let conversationId = ''
  let objective = ''
  try {
    const body = await request.json()
    objective = readBuilderObjective(body).objective
    conversationId = String(body?.conversationId || '').trim() || crypto.randomUUID()
    if (!UUID.test(conversationId)) return noStore({ error: 'Invalid conversation id.' }, { status: 400 })
    const requestedWorkspaceId = String(body?.workspaceId || '').trim()
    if (requestedWorkspaceId && !UUID.test(requestedWorkspaceId)) {
      return noStore({ error: 'Invalid workspace id.' }, { status: 400 })
    }
    const workspaceId = requestedWorkspaceId || crypto.randomUUID()

    const files = cleanFiles(body?.files)
    const debugPlan = planDebugFileJob(objective, files)
    const ownerDeveloperLogSubmission = access.isOwner
      && isOperationalLogEvidence(objective)
      && SIGNALBOOST_OPERATIONAL_TARGET.test(objective)
    const platformRepairTarget = files.length === 0
      ? signalBoostDeployedRepairTarget(objective, {
          commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
          branch: process.env.VERCEL_GIT_COMMIT_REF,
        }, { ownerDeveloperLogSubmission })
      : null

    // The direct Developer surface owns user-workspace jobs, but an owner-submitted operational
    // log about Builder needs the separate Platform Engineer. Pin it to the immutable deployed
    // revision supplied by Vercel and keep its output review-only; other passive logs grant no authority.
    if (platformRepairTarget) {
      if (!access.isOwner) {
        const reply = 'SignalBoost platform repair is owner-only. No repository was inspected and no code was run.'
        await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
        return noStore({ error: 'builder_repository_repair_owner_required', reply, execution_allowed: false }, { status: 403 })
      }
      const job = await enqueueSignalBoostRepositoryRepairJob({
        userId: access.userId,
        conversationId,
        objective,
        target: platformRepairTarget,
      })
      after(async () => { await runBuilderJob(job.jobId, access.userId) })
      return noStore({ ...job, status: 'queued', source: 'cos-platform-engineer' }, { status: 202 })
    }

    // A log plus one to four supported source files keeps the bounded debug protocol. A log
    // with no attachment is still a debugging job; it is tagged as log evidence with no repository
    // authority so the runner and History record what the paste did and did not grant.
    const logEvidence = isOperationalLogEvidence(objective)
    const passiveLogEvidence = isPastedOperationalLog(objective)

    if (files.length > 0 && DEBUG_OBJECTIVE.test(objective) && !debugPlan) {
      const reply = 'COS Builder debug jobs require one to four supported .js, .mjs, .cjs, .ts, .mts, .cts, or .py attachments no larger than 128 KiB each. No code was run.'
      await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
      return noStore({
        error: 'builder_debug_attachment_required',
        reply,
        execution_allowed: false,
        external_action_taken: false,
        files: [],
        trace: [],
      }, { status: 400 })
    }

    // Shared Concierge routing deliberately refuses pasted build/runtime logs so an ordinary chat
    // turn never silently starts coding work. On the Builder surface the log IS the submitted job:
    // the user pasted failure evidence into a developer workspace and asked it to debug. Logs are
    // admitted here, and only here; every other objective still faces the strict coding gate.
    const routingContext = { attachmentNames: files.map(file => file.path) }
    if (!debugPlan && !logEvidence && !isConciergeBuilderObjective(objective, routingContext)) {
      const reply = 'This request does not contain an executable coding or design objective with concrete source evidence. No Builder job was created and no code was run.'
      await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
      return noStore({
        error: 'builder_objective_not_coding',
        reply,
        execution_allowed: false,
        external_action_taken: false,
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
            debugPaths: debugPlan.files,
          }
        : logEvidence
          ? {
              logEvidence: true,
              passiveLogEvidence,
              repositoryAuthority: false,
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
    if (isBuilderObjectiveError(error)) {
      console.warn('[builder_objective_rejected]', {
        code: error.code,
        source: error.source || 'none',
        observedLength: error.observedLength,
        maxLength: error.maxLength,
      })
      const reply = objectiveFailureReply(error.code)
      return noStore({
        error: error.code,
        reply,
        execution_allowed: false,
        external_action_taken: false,
        files: [],
        trace: [],
      }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : 'builder_request_failed'
    const status = /^builder_(invalid|file_limit|file_too_large|invalid_path|debug_attachment_required|objective_not_coding)/.test(message) ? 400 : 502
    const reply = `COS Builder stopped: ${message}`
    await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
    return noStore({ error: message, reply }, { status })
  }
}
