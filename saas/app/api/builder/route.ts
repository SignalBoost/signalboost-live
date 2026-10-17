import { selectBuilderProject, builderProjectBlockedReply, isNewBuilderProjectObjective } from '@/lib/builder/project-continuity'
import { builderRepositoryTarget, importBuilderRepository, builderRepositoryErrorReply } from '@/lib/builder/repository-import'
// saas/app/api/builder/route.ts
import { after, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { isOperationalLogEvidence, isPastedOperationalLog } from '@/lib/ai/cos/pastedOperationalLog'
import { isConciergeBuilderObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'
import { planDebugFileJob, type DebugFileInput } from '@/lib/builder/debug-file-job'
import { builderPollMayResume, builderSoleResumableJob, enqueueBuilderJob, getBuilderJobForUser, readBuilderEvidenceJob, readLatestBuilderWorkspaceJob } from '@/lib/builder/job-store'
import { runBuilderJob, selfHealingCapacityJob } from '@/lib/builder/job-runner'
import { hasWorkspaceSource, isOwnerRepairWithoutSource, parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget } from '@/lib/builder/repository-repair-target'
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
const MAX_JOB_FILES = 100
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
      if (job.status === 'queued' || job.status === 'running' || job.status === 'paused') {
        // The person watching resumes their paused checkpoint now instead of waiting for the next scheduler tick.
        // Only when nothing is running and no other checkpoint waits, so polls never add a second job to the model slot;
        // the generation-fenced claim lets only one poll start it.
        if (builderPollMayResume(job) && !selfHealingCapacityJob(job) && await builderSoleResumableJob(job.id)) {
          after(async () => { await runBuilderJob(job.id, access.userId) })
        }
        return noStore({
          jobId: job.id,
          workspaceId: job.workspaceId,
          conversationId: job.conversationId,
          status: job.status,
          progress: {
            phase: job.checkpoint?.verificationPending === true ? 'verification'
              : job.status === 'queued' ? 'queued' : job.status === 'paused' ? 'checkpointed' : 'model',
            lastActivityAt: job.updatedAt,
            claimGeneration: job.claimGeneration,
            filesWritten: job.checkpoint?.workingFiles?.length ?? null,
            workRounds: job.checkpoint?.workRounds ?? null,
            modelTimeoutDeferrals: Number(job.metadata.builderCapacityDeferrals || 0),
            queueReason: typeof job.metadata.builderCapacityDeferredReason === 'string'
              ? job.metadata.builderCapacityDeferredReason : null,
            lastTest: (() => { const run = [...(job.checkpoint?.trace || [])].reverse().find(item => item.toolId === 'run'); const output = run?.output as { exitCode?: number; stdout?: string } | undefined; const stdout = output?.stdout || ''; return run ? { passed: run.ok, exitCode: output?.exitCode ?? null, testsPassed: Number(/(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/.exec(stdout)?.[1] || 0), testsFailed: Number(/(?:^|\n)\s*(?:#|ℹ)\s+fail\s+(\d+)/.exec(stdout)?.[1] || 0) } : null })(),
          },
          reply: job.status === 'queued' && job.metadata.builderCapacityDeferredReason === 'builder_runpod_primary_busy'
            ? 'Queued — waiting for model capacity. Builder will resume this saved job automatically.'
            : job.status === 'paused' && job.checkpoint?.verificationPending === true
              ? 'Files written — verifying changes. Builder will continue automatically.'
            : job.status === 'paused' ? 'Builder saved its progress and will continue automatically. Verification is not complete yet.' : runningReply(job.id),
        }, { status: 202 })
      }
      return noStore({
        ...(job.result || {}),
        jobId: job.id,
        workspaceId: job.workspaceId,
        conversationId: job.conversationId,
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
    if (!await workspace.hasWorkspace(workspaceId)) {
      return noStore({ error: 'Workspace not found.' }, { status: 404 })
    }
    const files = (await workspace.listFiles(workspaceId)).map(file => file.path)
    const latest = await readLatestBuilderWorkspaceJob({ userId: access.userId, workspaceId })
    const prior = latest?.metadata.platformRepair === true ? null : latest
    return noStore({ workspaceId, files,
      ...(prior ? { conversationId: prior.conversationId,
        ...(prior.status === 'queued' || prior.status === 'running' || prior.status === 'paused'
          ? { activeJobId: prior.id, activeStatus: prior.status } : {}) } : {}),
    })
  } catch {
    return noStore({ error: 'Unable to read workspace files right now.' }, { status: 503 })
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
    // Owner-scoped fresh jobs can explicitly exercise V2 without converting existing V1 checkpoints.
    // Reject unauthorized V2 requests rather than silently executing the legacy engine.
    const requestedEngine = body?.builderEngine
    if (requestedEngine !== undefined && requestedEngine !== 'v2') {
      return noStore({ error: 'builder_engine_invalid' }, { status: 400 })
    }
    const newProjectRequested = isNewBuilderProjectObjective(objective)
    // A new project never inherits the workspace the browser had selected.
    const selectedWorkspaceId = newProjectRequested ? '' : requestedWorkspaceId
    let workspaceId = selectedWorkspaceId || crypto.randomUUID()

    let files = cleanFiles(body?.files)
    const repositoryTarget = builderRepositoryTarget(objective, body?.repositoryUrl)
    const debugPlan = planDebugFileJob(objective, files)
    if (debugPlan) return noStore({ error: 'builder_v1_debug_mode_retired_use_v2', execution_allowed: false }, { status: 409 })
    const ownerDeveloperLogSubmission = access.isOwner
      && isOperationalLogEvidence(objective)
      && SIGNALBOOST_OPERATIONAL_TARGET.test(objective)
    const parsedFailedLogTarget = files.length === 0
      ? parseSignalBoostRepositoryRepairTarget(objective)
      : null
    const exactFailedLogTarget = parsedFailedLogTarget?.failureEvidence.length
      ? parsedFailedLogTarget
      : null
    // No dead-end for an owner's failed-log paste. An exact failed-log revision (clone line +
    // evidence) is always preferred and repaired at its own commit. A clipped or evidence-thin
    // pinned log is NOT refused: it falls through to a repair of the currently deployed commit.
    // The repair job reproduces the failure before it edits anything, so a log that does not
    // reproduce on the deployed revision yields an honest "could not reproduce" result rather than
    // a wrong-revision repair — the safety the old clone-line requirement was reaching for.
    const platformRepairTarget = files.length === 0
      ? exactFailedLogTarget ?? signalBoostDeployedRepairTarget(objective, {
          commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
          branch: process.env.VERCEL_GIT_COMMIT_REF,
        }, { ownerDeveloperLogSubmission })
      : null

    // The direct Developer surface owns user-workspace jobs, but an owner-submitted operational
    // log about Builder needs the separate Platform Engineer. Exact failed-build evidence always
    // wins over the deployed fallback so the historical failure is repaired at its real revision.
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

    // Shared Concierge routing deliberately refuses pasted build/runtime logs so an ordinary chat
    // turn never silently starts coding work. On the Builder surface the log IS the submitted job:
    // the user pasted failure evidence into a developer workspace and asked it to debug. Logs are
    // admitted here, and only here; every other objective still faces the strict coding gate.
    const project = await selectBuilderProject({ objective, userId: access.userId, conversationId,
      requestedWorkspaceId: selectedWorkspaceId || undefined,
      hasNewSource: files.length > 0, repositoryImport: Boolean(repositoryTarget),
    }, readBuilderEvidenceJob)
    if (project.blocked === 'busy' && project.activeJobId && project.workspaceId) {
      // One conversation keeps its existing durable job; a follow-up must not
      // fork a new workspace or ask the customer to submit the same task again.
      return noStore({
        jobId: project.activeJobId, workspaceId: project.workspaceId, conversationId,
        status: project.activeStatus || 'running',
        resumable: true, reply: runningReply(project.activeJobId),
      }, { status: 202 })
    }
    if (project.blocked) return noStore({ reply: builderProjectBlockedReply(project.blocked), execution_allowed: false }, { status: 503 })
    if (selectedWorkspaceId || project.context) {
      return noStore({ error: 'builder_v2_requires_fresh_workspace' }, { status: 409 })
    }
    workspaceId = project.workspaceId || workspaceId
    // A saved workspace may be opened from another browser conversation.
    // Its owner's active claim always wins; never start a competing job
    // against the same files because a new tab generated a different id.
    if (selectedWorkspaceId) {
      const previous = await readLatestBuilderWorkspaceJob({
        userId: access.userId, workspaceId: selectedWorkspaceId,
      })
      if (previous && previous.metadata.platformRepair !== true
        && (previous.status === 'queued' || previous.status === 'running' || previous.status === 'paused')) {
        return noStore({
          jobId: previous.id, workspaceId: previous.workspaceId, conversationId: previous.conversationId,
          status: previous.status, resumable: true, reply: runningReply(previous.id),
        }, { status: 202 })
      }
    }

    // An owner repair with no source anywhere goes to the platform repository at the deployed
    // revision instead of an empty workspace that can only answer "attach your source".
    if (access.isOwner && files.length === 0 && !repositoryTarget && !project.context && !(project.workspaceId || selectedWorkspaceId)) {
      const sourceWorkspaceId = project.workspaceId || selectedWorkspaceId
      const sourceWorkspace = sourceWorkspaceId ? createSupabaseBuilderWorkspace(access.userId) : null
      // A storage failure counts as "has files": never reroute a workspace whose contents are unknown.
      const workspaceHasFiles = sourceWorkspaceId
        ? !sourceWorkspace || await sourceWorkspace.listFiles(sourceWorkspaceId).then(listed => hasWorkspaceSource(listed.map(file => file.path)), () => true)
        : false
      const ownerRepairTarget = isOwnerRepairWithoutSource({
        objective, isOwner: true, hasAttachedSource: false, hasRepositoryImport: false,
        workspaceHasFiles, hasProjectContext: false,
      })
        ? signalBoostDeployedRepairTarget(objective, {
            commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
            branch: process.env.VERCEL_GIT_COMMIT_REF,
          }, { ownerRepairWithoutSource: true })
        : null
      if (ownerRepairTarget) {
        const job = await enqueueSignalBoostRepositoryRepairJob({
          userId: access.userId,
          conversationId,
          objective,
          target: ownerRepairTarget,
        })
        after(async () => { await runBuilderJob(job.jobId, access.userId) })
        return noStore({ ...job, status: 'queued', source: 'cos-platform-engineer' }, { status: 202 })
      }
    }
    const routingContext = { attachmentNames: files.map(file => file.path) }
    if (!project.context && !repositoryTarget && !debugPlan && !logEvidence && !isConciergeBuilderObjective(objective, routingContext)) {
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

    // A workspace's current file listing is not the whole source of truth:
    // prior jobs in this same authenticated conversation prove continuity.
    // Defer a transient empty listing to the claimed worker, where actual
    // source availability is rechecked before any coding tool can run.
    // A complete new-application specification is a new project (isNewBuilderProjectObjective), never a continuation.
    const continuationWorkspace = !newProjectRequested && !repositoryTarget && files.length === 0
      && Boolean(project.workspaceId || selectedWorkspaceId)
    if (continuationWorkspace) {
      // Verify the workspace is owned by this user without creating one.
      // A blank or failed file listing is not proof that the project was deleted.
      let exists: boolean
      try { exists = await workspace.hasWorkspace(workspaceId) }
      catch {
        return noStore({ error: 'Unable to verify selected workspace ownership right now.', execution_allowed: false }, { status: 503 })
      }
      if (!exists) {
        return noStore({ error: 'Selected workspace does not exist. No job was created.', execution_allowed: false }, { status: 404 })
      }
      try {
        const listed = await workspace.listFiles(workspaceId)
        if (!project.context && !hasWorkspaceSource(listed.map(file => file.path))) {
          return noStore({
            error: 'Selected workspace is empty. Choose the original project or connect/import the repository. No job was created.',
            execution_allowed: false,
          }, { status: 400 })
        }
      } catch {
        // Do not misclassify a transient storage failure as an empty workspace.
        return noStore({ error: 'Unable to verify selected workspace source files. No job was created.', execution_allowed: false }, { status: 503 })
      }
      // Claimed worker re-reads the existing workspace before making any edits.
    }

    await workspace.ensureWorkspace(workspaceId)
    await workspace.setObjective(workspaceId, objective)
    if (repositoryTarget) {
      try {
        if ((await workspace.listFiles(workspaceId)).length || files.length) throw new Error('builder_repository_requires_empty_workspace')
        const imported = await importBuilderRepository(repositoryTarget)
        files = imported.files
        objective += `\nSource imported from ${imported.repository} at commit ${imported.commitSha}${imported.directory ? `, folder ${imported.directory}` : ''}.`
      } catch (error) {
        return noStore({ reply: builderRepositoryErrorReply((error as Error).message), execution_allowed: false }, { status: 422 })
      }
    }
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
              ...(project.context ? { projectContext: project.context } : {}),
              logEvidence: true,
              passiveLogEvidence,
              repositoryAuthority: false,
              ...(continuationWorkspace ? { requiresExistingSource: true } : {}),
              builderEngine: 'v2',
            }
          : { ...(project.context ? { projectContext: project.context } : {}),
              ...(continuationWorkspace ? { requiresExistingSource: true } : {}),
              builderEngine: 'v2' },
      ownerAuthorized: access.isOwner === true,
      runningReply: reply,
    })

    after(async () => {
      await runBuilderJob(jobId, access.userId)
    })

    return noStore({
      jobId,
      workspaceId,
      conversationId,
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
    const status = /^builder_(invalid|file_limit|file_too_large|invalid_path|debug_attachment_required|objective_not_coding|repository_log_incomplete)/.test(message) ? 400 : 502
    const reply = `COS Builder stopped: ${message}`
    await persistSynchronousReply({ conversationId, userId: access.userId, objective, reply })
    return noStore({ error: message, reply }, { status })
  }
}
