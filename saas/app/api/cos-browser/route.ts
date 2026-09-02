import { after, NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { POST as legacyConciergePost } from '@/app/api/concierge/route'
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
import { isConciergeBuilderObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { analyzeOperationalLog, hasExplicitOperationalLogRepairIntent, isExplicitOperationalLogRepairRequest, isOperationalLogEvidence, isPastedOperationalLog, operationalLogReply } from '@/lib/ai/cos/pastedOperationalLog'
import { parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget } from '@/lib/builder/repository-repair-target'
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
 * Browser-only ingress wrapper for COS Primary.
 *
 * Passive Vercel/npm logs are classified before artifacts, visuals, or Builder. An explicit
 * owner repair request for an exact failed SignalBoost Vercel snapshot may enter only the
 * pinned, review-only Platform Engineer lane. Repair intent may carry across exactly one
 * immediately preceding user turn so “debug this” followed by the log remains one repair job.
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

  const routingContext = builderRoutingContextFromBody(body)
  const attachedOperationalEvidence = readAttachedOperationalEvidence(body?.attachments)
  const operationalPrompt = attachedOperationalEvidence ? `${prompt}\n\n${attachedOperationalEvidence}`.trim() : prompt
  const hasSourceAttachment = (routingContext.attachmentNames || []).some((name: string) =>
    /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i.test(String(name || '')),
  )
  const pastedOperationalLog = isPastedOperationalLog(operationalPrompt)
  const explicitOperationalRepair = isExplicitOperationalLogRepairRequest(operationalPrompt)
    || (pastedOperationalLog && hasExplicitOperationalLogRepairIntent(previousUserPrompt))

  const operationalLogAnalysis = analyzeOperationalLog(operationalPrompt)
  const exactFailedLogTarget = operationalLogAnalysis.failed
    ? parseSignalBoostRepositoryRepairTarget(operationalPrompt)
    : null
  const ownerSignalBoostLogTarget = access?.isOwner && access.userId && !hasSourceAttachment
    && isOperationalLogEvidence(operationalPrompt) && operationalLogAnalysis.failed
    && SIGNALBOOST_OPERATIONAL_TARGET.test(operationalPrompt)
    ? exactFailedLogTarget ?? signalBoostDeployedRepairTarget(prompt, {
        commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
        branch: process.env.VERCEL_GIT_COMMIT_REF,
      }, { ownerDeveloperLogSubmission: true })
    : null
  if (ownerSignalBoostLogTarget && access?.userId) {
    const conversationId = UUID.test(String(body?.context?.conversationId || ''))
      ? String(body.context.conversationId)
      : crypto.randomUUID()
    const objective = readBuilderObjective({ objective: operationalPrompt }).objective
    const job = await enqueueSignalBoostRepositoryRepairJob({
      userId: access.userId,
      conversationId,
      objective,
      target: ownerSignalBoostLogTarget,
    })
    after(async () => { await runBuilderJob(job.jobId, access.userId!) })
    return NextResponse.json({ ...job, status: 'queued', source: 'cos-platform-engineer' }, { status: 202 })
  }

  if (explicitOperationalRepair && !hasSourceAttachment) {
    const repositoryTarget = parseSignalBoostRepositoryRepairTarget(operationalPrompt)
    if (access?.isOwner && access.userId && repositoryTarget) {
      const conversationId = UUID.test(String(body?.context?.conversationId || ''))
        ? String(body.context.conversationId)
        : crypto.randomUUID()
      const objective = readBuilderObjective({ objective: operationalPrompt }).objective
      const job = await enqueueSignalBoostRepositoryRepairJob({
        userId: access.userId,
        conversationId,
        objective,
        target: repositoryTarget,
      })
      after(async () => { await runBuilderJob(job.jobId, access.userId!) })
      return NextResponse.json({ ...job, status: 'queued', source: 'cos-platform-engineer' }, { status: 202 })
    }

    const reply = repositoryTarget
      ? 'This is an explicit SignalBoost repository-repair request, but repository repair is owner-only. No code was run.'
      : `${operationalLogReply(operationalPrompt)} For repository repair directly from a Vercel log, include the failed SignalBoost clone line with its branch/commit and the final failing assertion or non-zero build command.`
    return withSuggestedFollowups(NextResponse.json({
      reply,
      source: 'concierge-operational-log-repair-not-authorized',
      execution_allowed: false,
      external_action_taken: false,
      external_ai_invoked: false,
      local_model_invoked: false,
    }), prompt, auditUserId)
  }

  // Passive logs carry evidence but no execution authority. Continue through ordinary COS so a
  // diagnostic question receives a useful explanation and dialogue instead of the obsolete canned
  // "not editable source" reply. Builder routing still excludes unattached operational logs.

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

  // Operational evidence must never be reinterpreted as a creative objective. Build output can
  // contain test titles such as "draw named people" or "create image"; those strings describe
  // the test suite and do not authorize the visual or artifact tools.
  const creativeRoutingAllowed = !isOperationalLogEvidence(operationalPrompt)

  if (creativeRoutingAllowed && isConciergeArtifactObjective(prompt)) {
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

  if (creativeRoutingAllowed && isConciergeVisualObjective(prompt)) {
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

  if (isProvenanceIntrospection(prompt)) {
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
  }))

  const response = await withPublicAuditIdentity(auditUserId, () =>
    withPublicDeliveryScope(() =>
      withRunpodWakePermission(permission, () => isConciergeBuilderObjective(operationalPrompt, routingContext) ? legacyConciergePost(routedRequest) : cosPrimaryPost(routedRequest)),
    ),
  )
  return withSuggestedFollowups(response, prompt, auditUserId)
}
