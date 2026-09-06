import { builderRepositoryImportIntent, builderRepositoryTarget, importBuilderRepository, builderRepositoryErrorReply } from '@/lib/builder/repository-import'
import { after, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { publicAuditUserId } from '@/lib/auth/publicAuditIdentity'
import { isConciergeBuilderObjective, type CosCodingRoutingContext } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { isOperationalLogEvidence } from '@/lib/ai/cos/pastedOperationalLog'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { extractBuilderSourceFiles, planDebugFileJob } from '@/lib/builder/debug-file-job'
import { enqueueBuilderJob } from '@/lib/builder/job-store'
import { readBuilderEvidenceJob } from '@/lib/builder/job-store'
import { builderEvidenceReply } from '@/lib/builder/execution-evidence'
import { runBuilderJob } from '@/lib/builder/job-runner'
import {
  parseSignalBoostRepositoryRepairTarget,
  signalBoostDeployedRepairTarget,
  type SignalBoostRepositoryRepairTarget,
} from '@/lib/builder/repository-repair-target'
import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import { readBuilderObjective } from '@/lib/builder/request-contract'

export type CosSoftwareSpecialistSurface = 'concierge' | 'assistant'

export type CosSoftwareSpecialistRequest = Readonly<{
  body: any
  objective: string
  surface: CosSoftwareSpecialistSurface
  allowRepositoryRepair?: boolean
  signalBoostDeploymentContext?: boolean
  deployment?: Readonly<{
    commitSha?: string | null
    branch?: string | null
  }>
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SOURCE_ATTACHMENT = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i
const SIGNALBOOST_OPERATIONAL_TARGET = /\b(?:signalboost-live|(?:saas\.)?signalboostapp\.com)\b/i
const DESIGN_ARTIFACT = /\b(?:website|web\s*page|landing(?:\s|-)?page|dashboard|user interface|ui|component|mockup|prototype)\b/i
const DESIGN_REQUEST = /(?:^(?:please\s+)?(?:design|build|create|make)\b|\b(?:can|could)\s+you\b|\b(?:i\s+(?:need|want|would\s+like)|give\s+me|help\s+me)\b)/i

function routingContext(body: any): CosCodingRoutingContext {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return {
    attachmentNames: attachments.map((item: any) => String(item?.name || '')),
    attachmentMimeTypes: attachments.map((item: any) => String(item?.mimeType || item?.type || '')),
    attachmentSizes: attachments.map((item: any) => Number(item?.size || 0)),
  }
}

function hasSourceAttachment(context: CosCodingRoutingContext): boolean {
  return (context.attachmentNames || []).some(name => SOURCE_ATTACHMENT.test(String(name || '').trim()))
}

function hasImageOrPdfAttachment(body: any): boolean {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return attachments.some((item: any) => /image\/|application\/pdf/i.test(String(item?.mimeType || item?.type || '')))
}

function conversationIdFrom(body: any): string | null {
  const value = String(body?.context?.conversationId || '')
  return UUID.test(value) ? value : null
}

function workspaceIdFrom(body: any): string {
  const requested = String(body?.workspaceId || body?.context?.workspaceId || '').trim()
  return UUID.test(requested) ? requested : crypto.randomUUID()
}

function softwareSpecialistFields(skill: string) {
  return {
    specialist_family: 'software',
    specialist_skill: skill,
    orchestrator: 'cos',
  }
}

function runningReply(jobId: string): string {
  return `COS Software Specialist is running Builder job ${jobId}. Progress and the final result are durable in History; the action will not be replayed.`
}

async function enqueueRepositoryRepair(input: {
  body: any
  objective: string
  userId: string
  target: SignalBoostRepositoryRepairTarget
}) {
  const conversationId = conversationIdFrom(input.body) || crypto.randomUUID()
  const objective = readBuilderObjective({ objective: input.objective }).objective
  const job = await enqueueSignalBoostRepositoryRepairJob({
    userId: input.userId,
    conversationId,
    objective,
    target: input.target,
  })
  after(async () => { await runBuilderJob(job.jobId, input.userId) })
  return NextResponse.json({
    ...job,
    status: 'queued',
    source: 'cos-platform-engineer',
    ...softwareSpecialistFields('software.platform-repair'),
  }, { status: 202 })
}

/**
 * COS-owned Software Specialist execution seam.
 *
 * Surfaces may supply the user's request and surface context, but they do not independently choose
 * a coding brain. This function owns the software-specialist admission/execution decision while
 * preserving the existing public-workspace and owner-only repository-repair authority boundaries.
 */
export async function tryCosSoftwareSpecialist(input: CosSoftwareSpecialistRequest): Promise<NextResponse | null> {
  let objective = String(input.objective || '').trim()
  if (!objective) return null

  const context = routingContext(input.body)
  const sourceAttached = hasSourceAttachment(context)
  const access = await getAccess().catch(() => null)

  const priorAnswer = (Array.isArray(input.body?.messages) ? input.body.messages : [])
    .filter((message: any) => message?.role === 'assistant' && typeof message.content === 'string').at(-1)?.content || ''
  const evidence = await builderEvidenceReply({
    prompt: objective,
    userId: access?.userId || publicAuditUserId(),
    conversationId: conversationIdFrom(input.body),
    priorAnswer,
    allowRepositoryEvidence: input.surface === 'assistant' && access?.isOwner === true,
  }, readBuilderEvidenceJob)
  if (evidence !== null) return NextResponse.json({
    reply: evidence, source: 'cos-builder-recorded-evidence',
    execution_allowed: false, external_action_taken: false,
    local_model_invoked: false, external_ai_invoked: false,
    ...softwareSpecialistFields('software.verify'),
  })

  if (input.allowRepositoryRepair && access?.isOwner && access.userId && !sourceAttached) {
    const operationalEvidence = isOperationalLogEvidence(objective)
    const exactTarget = operationalEvidence ? parseSignalBoostRepositoryRepairTarget(objective) : null
    const ownerDeveloperLogSubmission = operationalEvidence
      && (SIGNALBOOST_OPERATIONAL_TARGET.test(objective) || input.signalBoostDeploymentContext === true)
    const deployment = {
      commitSha: input.deployment?.commitSha || undefined,
      branch: input.deployment?.branch || undefined,
    }
    const target = exactTarget
      ?? signalBoostDeployedRepairTarget(objective, deployment)
      ?? signalBoostDeployedRepairTarget(objective, deployment, { ownerDeveloperLogSubmission })

    if (target) {
      return enqueueRepositoryRepair({
        body: input.body,
        objective,
        userId: access.userId,
        target,
      })
    }
  }

  const importRequested = builderRepositoryImportIntent(objective)
  let repositoryTarget
  try { repositoryTarget = importRequested ? builderRepositoryTarget(objective, input.body?.repositoryUrl) : null }
  catch (error) { return NextResponse.json({ reply: builderRepositoryErrorReply((error as Error).message), execution_allowed: false }, { status: 400 }) }

  const roleMatched = isConciergeBuilderObjective(objective, context)
  const designMatched = DESIGN_ARTIFACT.test(objective) && DESIGN_REQUEST.test(objective)
  if (hasImageOrPdfAttachment(input.body) || !(roleMatched || designMatched || repositoryTarget)) return null

  // Public Concierge intentionally receives guest access under public-delivery scope. Its server-
  // captured audit identity may own an isolated workspace, but it never gains owner repository authority.
  const builderUserId = access?.userId || publicAuditUserId()
  if (!builderUserId || !UUID.test(builderUserId)) {
    return NextResponse.json({
      reply: 'I can debug and build that in an isolated sandbox. Sign in so the Software Specialist can attach a workspace to your account, then send the same request again.',
      source: 'cos-builder-sign-in-required',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.build'),
    })
  }

  const workspace = createSupabaseBuilderWorkspace(builderUserId)
  if (!workspace) {
    return NextResponse.json({
      reply: 'COS Software Specialist storage is unavailable right now. No code was run.',
      source: 'cos-builder-storage-unavailable',
      execution_allowed: false,
      external_action_taken: false,
      ...softwareSpecialistFields('software.build'),
    }, { status: 503 })
  }

  const workspaceId = workspaceIdFrom(input.body)
  await workspace.ensureWorkspace(workspaceId)
  let stagedFiles = extractBuilderSourceFiles([
    ...(Array.isArray(input.body?.files) ? input.body.files : []),
    ...(Array.isArray(input.body?.attachments) ? input.body.attachments : []),
  ])
  if (repositoryTarget) {
    try {
      if ((await workspace.listFiles(workspaceId)).length || stagedFiles.length) throw new Error('builder_repository_requires_empty_workspace')
      const imported = await importBuilderRepository(repositoryTarget)
      stagedFiles = imported.files
      objective += `\nSource imported from ${imported.repository} at commit ${imported.commitSha}${imported.directory ? `, folder ${imported.directory}` : ''}.`
    } catch (error) {
      return NextResponse.json({ reply: builderRepositoryErrorReply((error as Error).message), execution_allowed: false }, { status: 422 })
    }
  }
  for (const file of stagedFiles) await workspace.writeFile(workspaceId, file.path, file.content)

  const conversationId = conversationIdFrom(input.body) || crypto.randomUUID()
  const jobId = crypto.randomUUID()
  const debugPlan = repositoryTarget ? null : planDebugFileJob(objective, stagedFiles)
  const reply = runningReply(jobId)
  const specialistSkill = debugPlan ? 'software.repair' : 'software.build'

  try {
    await enqueueBuilderJob({
      jobId,
      workspaceId,
      userId: builderUserId,
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
        : {},
      ownerAuthorized: access?.isOwner === true,
      runningReply: reply,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_job_enqueue_failed'
    return NextResponse.json({
      reply: `COS Software Specialist stopped: ${message}`,
      source: 'cos-builder',
      workspaceId,
      files: stagedFiles.map(file => file.path),
      execution_allowed: true,
      external_action_taken: false,
      ...softwareSpecialistFields(specialistSkill),
    }, { status: 422 })
  }

  after(async () => { await runBuilderJob(jobId, builderUserId) })

  return NextResponse.json({
    reply,
    source: 'cos-builder',
    jobId,
    workspaceId,
    status: 'queued',
    files: stagedFiles.map(file => file.path),
    execution_allowed: true,
    external_action_taken: false,
    ...softwareSpecialistFields(specialistSkill),
  }, { status: 202 })
}
