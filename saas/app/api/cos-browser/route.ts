// saas/app/api/cos-browser/route.ts
import { after, NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { POST as publicConciergePost } from '@/app/api/concierge/route'
import { POST as artifactPost } from '@/app/api/artifacts/route'
import { POST as visualPost } from '@/app/api/visuals/route'
import { evaluateRunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'
import { withRunpodWakePermission } from '@/lib/ai/local-inference'
import { getAccess } from '@/lib/auth/access'
import { withPublicAuditIdentity } from '@/lib/auth/publicAuditIdentity'
import { withPublicDeliveryScope } from '@/lib/auth/publicDeliveryScope'
import { isProvenanceIntrospection } from '@/lib/ai/cos/cosOrchestration'
import { readCosPrimaryPriorProvenance } from '@/lib/ai/cos/cosPrimaryTurnProvenance'
import { renderPublicRecordedProvenance } from '@/lib/ai/cos/publicRecordedProvenance'
import { suggestFollowups } from '@/lib/ai/cos/suggestedFollowups'
import { attachSuggestedFollowupsToStoredTurn } from '@/lib/ai/cos/supportTurnProvenance'
import { tryCosSoftwareSpecialist } from '@/lib/ai/cos/softwareSpecialist'
import { analyzeOperationalLog, hasExplicitOperationalLogRepairIntent, isExplicitOperationalLogRepairRequest, isOperationalLogEvidence, isPastedOperationalLog, operationalLogReply } from '@/lib/ai/cos/pastedOperationalLog'
import { diagnoseOperationalLog } from '@/lib/ai/cos/operationalLogDiagnostic'
import { parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget, type SignalBoostRepositoryRepairTarget } from '@/lib/builder/repository-repair-target'
import { enqueueSignalBoostRepositoryRepairJob } from '@/lib/builder/repository-repair-job'
import { runBuilderJob } from '@/lib/builder/job-runner'
import { readBuilderObjective } from '@/lib/builder/request-contract'
import { isConciergeArtifactObjective } from '@/lib/artifacts/intent'
import { isConciergeVisualObjective } from '@/lib/visuals/intent'
import { readAttachedOperationalEvidence } from '@/lib/ai/cos/attachedOperationalEvidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
const SIGNALBOOST_OPERATIONAL_TARGET = /\b(?:signalboost-live|(?:saas\.)?signalboostapp\.com)\b/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isSignalBoostDeploymentContext(req: NextRequest): boolean {
  const owner = String(process.env.VERCEL_GIT_REPO_OWNER || '').trim().toLowerCase()
  const repo = String(process.env.VERCEL_GIT_REPO_SLUG || '').trim().toLowerCase()
  const host = String(req.nextUrl.hostname || '').trim().toLowerCase()
  return (owner === 'signalboost' && repo === 'signalboost-live') || host === 'saas.signalboostapp.com'
}

// Transitional fallback while the first Software Specialist slice is being accepted. The shared
// specialist resolves this same owner-only target first; keeping this exact lane temporarily means a
// specialist-classification regression cannot silently remove already-proven Platform Engineer authority.
async function queueOwnerRepositoryRepair(input: {
  body: any
  userId: string
  objective: string
  target: SignalBoostRepositoryRepairTarget
}): Promise<NextResponse> {
  const conversationId = UUID.test(String(input.body?.context?.conversationId || ''))
    ? String(input.body.context.conversationId)
    : crypto.randomUUID()
  const objective = readBuilderObjective({ objective: input.objective }).objective
  const job = await enqueueSignalBoostRepositoryRepairJob({
    userId: input.userId,
    conversationId,
    objective,
    target: input.target,
  })
  after(async () => { await runBuilderJob(job.jobId, input.userId) })
  return NextResponse.json({ ...job, status: 'queued', source: 'cos-platform-engineer' }, { status: 202 })
}

export async function withSuggestedFollowups(response: Response, prompt: string, userId: string | null = null): Promise<NextResponse> {
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  let payload: any
  try { payload = await response.clone().json() } catch {
    return new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  if (!payload || typeof payload !== 'object' || !String(payload.reply || '').trim()) {
    return NextResponse.json(payload, { status: response.status, headers })
  }
  if (Array.isArray(payload.suggested_followups) && payload.suggested_followups.length === 2) {
    if (userId) await attachSuggestedFollowupsToStoredTurn(userId, String(payload.reply), payload.suggested_followups)
    return NextResponse.json(payload, { status: response.status, headers })
  }
  const successful = response.ok && payload.ok !== false
  payload.suggested_followups = await suggestFollowups({
    prompt,
    reply: String(payload.reply),
    sources: Array.isArray(payload.live_evidence_sources) ? payload.live_evidence_sources : [],
    failedClosed: !successful,
  })
  if (userId && payload.suggested_followups.length === 2) {
    await attachSuggestedFollowupsToStoredTurn(userId, String(payload.reply), payload.suggested_followups)
  }
  return NextResponse.json(payload, { status: response.status, headers })
}

function inlineVisualResponse(response: Response): Promise<NextResponse> {
  return response.clone().json().then((payload: any) => {
    const workspaceId = typeof payload?.workspaceId === 'string' ? payload.workspaceId : ''
    const imagePath = Array.isArray(payload?.files)
      ? payload.files.find((path: unknown): path is string => typeof path === 'string' && /\.(?:png|jpe?g|webp)$/i.test(path))
      : ''
    if (!workspaceId || !imagePath || typeof payload?.reply !== 'string') return NextResponse.json(payload, { status: response.status })
    const previewUrl = `/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${imagePath.split('/').map(encodeURIComponent).join('/')}?preview=1`
    return NextResponse.json({
      ...payload,
      visual: {
        previewUrl,
        downloadUrl: previewUrl.replace('?preview=1', ''),
        alt: 'Generated visual',
      },
    }, { status: response.status })
  }).catch(() => new NextResponse(response.body, { status: response.status, headers: response.headers }))
}

function builderRoutingContextFromBody(body: any) {
  const attachments = Array.isArray(body?.attachments) ? body.attachments : []
  return {
    attachmentNames: attachments.map((item: any) => String(item?.name || '')),
    attachmentMimeTypes: attachments.map((item: any) => String(item?.mimeType || item?.type || '')),
    attachmentSizes: attachments.map((item: any) => Number(item?.size || 0)),
  }
}

/**
 * Canonical browser ingress for both Concierge and owner Assistant.
 *
 * The browser surface is explicit and security-relevant. `x-signalboost-surface: concierge` always
 * retains public-delivery isolation even when the authenticated account is the owner; only the
 * `cos` Assistant surface may use owner memory, configuration, or repository-repair authority.
 * Operational/build logs are resolved before generic intent routing so copied logs cannot gain
 * authority merely from words inside them.
 */
export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const userMessages = messages.filter((message: any) => message?.role === 'user' && typeof message?.content === 'string')
  const latestUser = userMessages.at(-1)
  const previousUser = userMessages.at(-2)
  const prompt = typeof latestUser?.content === 'string' ? latestUser.content : ''
  const previousUserPrompt = typeof previousUser?.content === 'string' ? previousUser.content : ''
  const assistantMessages = messages.filter((message: any) => message?.role === 'assistant' && typeof message?.content === 'string')
  const priorAnswer = typeof assistantMessages.at(-1)?.content === 'string' ? assistantMessages.at(-1).content : ''
  const language = ['en', 'es', 'pt', 'pl', 'ru'].includes(String(body?.context?.language || '').toLowerCase())
    ? String(body.context.language).toLowerCase()
    : 'en'

  const access = await getAccess().catch(() => null)
  const auditUserId = access?.userId ?? null
  // Fail-safe default: an unmarked browser request is public Concierge. Only the explicit owner
  // Assistant marker may request the privileged lane, and server-side identity is still required.
  const browserSurface: 'concierge' | 'assistant' = req.headers.get('x-signalboost-surface') === 'cos'
    ? 'assistant'
    : 'concierge'

  const routingContext = builderRoutingContextFromBody(body)
  const attachedOperationalEvidence = readAttachedOperationalEvidence(body?.attachments)
  const operationalPrompt = attachedOperationalEvidence ? `${prompt}\n\n${attachedOperationalEvidence}`.trim() : prompt
  const hasSourceAttachment = (routingContext.attachmentNames || []).some((name: string) =>
    /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i.test(String(name || '')),
  )
  const operationalEvidence = isOperationalLogEvidence(operationalPrompt)
  const pastedOperationalLog = isPastedOperationalLog(operationalPrompt)
  const explicitOperationalRepair = isExplicitOperationalLogRepairRequest(operationalPrompt)
    || (pastedOperationalLog && hasExplicitOperationalLogRepairIntent(previousUserPrompt))

  const deployment = {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
  }

  // COS owns specialist selection for both faces, but authority is asymmetric. Public Concierge can
  // use the isolated Software Specialist workspace; repository repair remains exclusive to the owner
  // Assistant surface and still requires server-side owner authentication inside the specialist.
  const softwareSpecialist = browserSurface === 'assistant'
    ? await tryCosSoftwareSpecialist({
        body,
        objective: operationalPrompt || prompt,
        surface: 'assistant',
        allowRepositoryRepair: true,
        signalBoostDeploymentContext: isSignalBoostDeploymentContext(req),
        deployment,
      })
    : await tryCosSoftwareSpecialist({
        body,
        objective: operationalPrompt || prompt,
        surface: 'concierge',
        allowRepositoryRepair: false,
        signalBoostDeploymentContext: false,
        deployment,
      })
  if (softwareSpecialist) return softwareSpecialist

  const operationalLogAnalysis = analyzeOperationalLog(operationalPrompt)
  const exactFailedLogTarget = operationalEvidence
    ? parseSignalBoostRepositoryRepairTarget(operationalPrompt)
    : null

  // Transitional defense-in-depth fallback. Public Concierge can never enter this owner lane even
  // when the signed-in account happens to be the owner.
  const ownerDeveloperLogSubmission = browserSurface === 'assistant'
    && access?.isOwner === true
    && operationalEvidence
    && (SIGNALBOOST_OPERATIONAL_TARGET.test(operationalPrompt) || isSignalBoostDeploymentContext(req))

  const ownerRepositoryRepairTarget = browserSurface === 'assistant' && access?.isOwner && access.userId && !hasSourceAttachment
    ? exactFailedLogTarget
      ?? signalBoostDeployedRepairTarget(prompt, deployment)
      ?? signalBoostDeployedRepairTarget(operationalPrompt, deployment, { ownerDeveloperLogSubmission })
    : null
  if (ownerRepositoryRepairTarget && access?.userId) {
    return queueOwnerRepositoryRepair({
      body,
      userId: access.userId,
      objective: operationalPrompt || prompt,
      target: ownerRepositoryRepairTarget,
    })
  }

  if (explicitOperationalRepair && !hasSourceAttachment) {
    const reply = exactFailedLogTarget
      ? 'This is an explicit SignalBoost repository-repair request, but repository repair is owner-only. No code was run.'
      : `${operationalLogReply(operationalPrompt)} For repository repair directly from a Vercel log, an authenticated owner can use the pinned SignalBoost deployment context; other users need to provide editable source in the ordinary Builder lane.`
    return withSuggestedFollowups(NextResponse.json({
      reply,
      source: 'concierge-operational-log-repair-not-authorized',
      execution_allowed: false,
      external_action_taken: false,
      external_ai_invoked: false,
      local_model_invoked: false,
    }), prompt, auditUserId)
  }

  // Unattached operational evidence has a dedicated bounded reasoning lane. It never enters the
  // generic intent router, so test titles cannot become artifact/visual/provenance requests, but
  // COS can still explain the observed failure instead of merely echoing the exit code.
  if (operationalEvidence && !hasSourceAttachment) {
    const diagnostic = await diagnoseOperationalLog({ request: prompt, log: operationalPrompt, language })
    return withSuggestedFollowups(NextResponse.json({
      reply: diagnostic.reply,
      source: diagnostic.reasonerInvoked ? 'concierge-operational-log-diagnostic' : 'concierge-operational-log-analysis',
      execution_allowed: false,
      external_action_taken: false,
      external_ai_invoked: false,
      local_model_invoked: diagnostic.reasonerInvoked,
      confidence: diagnostic.confidence,
    }), prompt, auditUserId)
  }

  const routedHeaders = new Headers(req.headers)
  routedHeaders.set('content-type', 'application/json')
  routedHeaders.delete('content-length')
  const routedRequest = attachedOperationalEvidence
    ? new NextRequest(req.url, {
        method: 'POST',
        headers: routedHeaders,
        body: JSON.stringify({
          ...body,
          messages: messages.map((message: any) => message === latestUser ? { ...message, content: operationalPrompt } : message),
        }),
      })
    : req

  if (!operationalEvidence) {
    if (isConciergeArtifactObjective(prompt)) {
      const headers = new Headers(req.headers)
      headers.set('content-type', 'application/json')
      headers.delete('content-length')
      const artifactRequest = new NextRequest(new URL('/api/artifacts', req.url), {
        method: 'POST',
        headers,
        body: JSON.stringify({ objective: prompt }),
      })
      return withSuggestedFollowups(await artifactPost(artifactRequest), prompt, auditUserId)
    }

    if (isConciergeVisualObjective(prompt)) {
      const headers = new Headers(req.headers)
      headers.set('content-type', 'application/json')
      headers.delete('content-length')
      const visualRequest = new NextRequest(new URL('/api/visuals', req.url), {
        method: 'POST',
        headers,
        body: JSON.stringify({ objective: prompt }),
      })
      return withSuggestedFollowups(await inlineVisualResponse(await visualPost(visualRequest)), prompt, auditUserId)
    }
  }

  // Public Concierge gets the public recorded-provenance posture regardless of whether the account
  // behind the audit identity is an owner. Only the explicit Assistant surface may see privileged
  // provenance through cos-primary.
  if (!operationalEvidence && browserSurface === 'concierge' && isProvenanceIntrospection(prompt)) {
    const recorded = await withPublicAuditIdentity(auditUserId, () =>
      withPublicDeliveryScope(() => readCosPrimaryPriorProvenance(auditUserId, priorAnswer)),
    )
    const reply = renderPublicRecordedProvenance(recorded, language)
    return withSuggestedFollowups(NextResponse.json({
      reply,
      source: recorded ? 'concierge-public-provenance-recorded' : 'concierge-public-provenance-unavailable',
      external_ai_invoked: false,
      local_model_invoked: false,
      provenance_match_verified: Boolean(recorded),
    }), prompt, auditUserId)
  }

  const permission = evaluateRunpodWakePermission({
    body,
    interactionHeader: req.headers.get('x-signalboost-user-interaction'),
    requestOrigin: req.headers.get('origin'),
    expectedOrigin: req.nextUrl.origin,
    secFetchSite: req.headers.get('sec-fetch-site'),
  })

  console.info('[cos-browser-runpod-wake-permission]', JSON.stringify({
    at: new Date().toISOString(),
    allowed: permission.allowed,
    source: permission.source,
    interactionId: permission.interactionId,
    ageMs: permission.ageMs,
    reason: permission.reason,
    auditIdentityCaptured: Boolean(auditUserId),
    browserSurface,
  }))

  const executeOwnerRequest = () => withRunpodWakePermission(permission, () => cosPrimaryPost(routedRequest))
  const executePublicRequest = () => withRunpodWakePermission(permission, () => publicConciergePost(routedRequest))

  const response = access?.isOwner && browserSurface === 'assistant'
    ? await executeOwnerRequest()
    : await withPublicAuditIdentity(auditUserId, () =>
        withPublicDeliveryScope(() => executePublicRequest()),
      )
  return withSuggestedFollowups(response, prompt, auditUserId)
}
