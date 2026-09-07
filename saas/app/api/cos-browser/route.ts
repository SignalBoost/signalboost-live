// saas/app/api/cos-browser/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { POST as publicConciergePost } from '@/app/api/concierge/route'
import { POST as artifactPost } from '@/app/api/artifacts/route'
import { POST as visualPost } from '@/app/api/visuals/route'
import { getAccess } from '@/lib/auth/access'
import { withPublicAuditIdentity } from '@/lib/auth/publicAuditIdentity'
import { withPublicDeliveryScope } from '@/lib/auth/publicDeliveryScope'
import { isProvenanceIntrospection } from '@/lib/ai/cos/cosOrchestration'
import { readCosPrimaryPriorProvenance } from '@/lib/ai/cos/cosPrimaryTurnProvenance'
import { renderPublicRecordedProvenance } from '@/lib/ai/cos/publicRecordedProvenance'
import { suggestFollowups } from '@/lib/ai/cos/suggestedFollowups'
import { attachSuggestedFollowupsToStoredTurn } from '@/lib/ai/cos/supportTurnProvenance'
import { tryCosSoftwareSpecialist } from '@/lib/ai/cos/softwareSpecialist'
import {
  analyzeOperationalLog,
  compactOperationalLogForRepair,
  isOperationalLogEvidence,
  isPastedOperationalLog,
  operationalLogReply,
} from '@/lib/ai/cos/pastedOperationalLog'
import { diagnoseOperationalLog } from '@/lib/ai/cos/operationalLogDiagnostic'
import { isOperationalLogRepairOffer } from '@/lib/ai/cos/pastedOperationalLog'
import { clarificationQuestion, understandRequest } from '@/lib/ai/cos/requestUnderstanding'
import { isConciergeArtifactObjective } from '@/lib/artifacts/intent'
import { isConciergeVisualObjective } from '@/lib/visuals/intent'
import { isSemanticVisualRequest } from '@/lib/visuals/semanticIntent'
import { readAttachedOperationalEvidence } from '@/lib/ai/cos/attachedOperationalEvidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// COS is the private reasoning/orchestration layer. This object represents an authenticated owner
// capability, not a UI-surface capability. Concierge and Assistant are delivery surfaces; neither
// is allowed to manufacture authority, and neither is the software execution controller.
const ownerSoftwareAuthority = Object.freeze({ allowRepositoryRepair: true })

function isSignalBoostDeploymentContext(req: NextRequest): boolean {
  const owner = String(process.env.VERCEL_GIT_REPO_OWNER || '').trim().toLowerCase()
  const repo = String(process.env.VERCEL_GIT_REPO_SLUG || '').trim().toLowerCase()
  const host = String(req.nextUrl.hostname || '').trim().toLowerCase()
  return (owner === 'signalboost' && repo === 'signalboost-live') || host === 'saas.signalboostapp.com'
}

/**
 * Public Concierge is the mouth, never the private brain. Internal orchestration labels are useful
 * for server telemetry but must not become the public product identity. Keep this boundary on the
 * canonical browser ingress so every externally delivered Concierge reply is covered, including
 * Software Specialist status replies returned before ordinary answer synthesis.
 */
async function publicConciergePresentation(response: Response): Promise<NextResponse> {
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  let payload: any
  try { payload = await response.clone().json() } catch {
    return new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  if (!payload || typeof payload !== 'object') return NextResponse.json(payload, { status: response.status, headers })
  if (typeof payload.reply === 'string') {
    payload.reply = payload.reply
      .replace(/\bCOS Software Specialist\b/g, 'Software Specialist')
      .replace(/\bCOS Platform Engineer\b/g, 'Platform Engineer')
      .replace(/\bCOS\b/g, 'SignalBoost')
  }
  // `orchestrator: cos` is internal execution telemetry. The public mouth may expose the selected
  // specialist and durable job status, but it does not disclose the private reasoning layer.
  if (payload.orchestrator === 'cos') delete payload.orchestrator
  return NextResponse.json(payload, { status: response.status, headers })
}

export async function withSuggestedFollowups(response: Response, prompt: string, userId: string | null = null): Promise<NextResponse> {
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  let payload: any
  try { payload = await response.clone().json() } catch {
    return new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  if (!payload || typeof payload !== 'object' || !String(payload.reply || '').trim()) return NextResponse.json(payload, { status: response.status, headers })
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
  if (userId && payload.suggested_followups.length === 2) await attachSuggestedFollowupsToStoredTurn(userId, String(payload.reply), payload.suggested_followups)
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
      visual: { previewUrl, downloadUrl: previewUrl.replace('?preview=1', ''), alt: 'Generated visual' },
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
  const browserSurface: 'concierge' | 'assistant' = req.headers.get('x-signalboost-surface') === 'cos' ? 'assistant' : 'concierge'
  const authenticatedOwner = access?.isOwner === true && Boolean(access.userId)

  const routingContext = builderRoutingContextFromBody(body)
  const attachedOperationalEvidence = readAttachedOperationalEvidence(body?.attachments)
  const currentOperationalPrompt = attachedOperationalEvidence ? `${prompt}\n\n${attachedOperationalEvidence}`.trim() : prompt

  // Understand the request as a conversation, not as a command language. This semantic pass does
  // not grant authority. Its mutation-specific output can only narrow an execution lane, while an
  // unresolved action/referent returns one natural clarification before any specialist can act.
  const requestUnderstanding = await understandRequest({
    prompt,
    previousUserPrompt,
    priorAnswer,
    hasAttachments: Array.isArray(body?.attachments) && body.attachments.length > 0,
  })

  // Passive operational evidence never authorizes itself. When the current turn semantically asks
  // to repair the immediately preceding log (including an ordinary agreement to our repair offer),
  // preserve the log head+tail inside Builder's durable objective cap. No literal phrase is special.
  const previousOperationalEvidence = isPastedOperationalLog(previousUserPrompt)
  const answeringOurRepairOffer = previousOperationalEvidence && isOperationalLogRepairOffer(priorAnswer)
  const followupOperationalRepair = requestUnderstanding?.softwareRepairIntent === true
    && previousOperationalEvidence
  const operationalPrompt = followupOperationalRepair
    ? `${prompt.trim()}\n\n${compactOperationalLogForRepair(previousUserPrompt)}`
    : currentOperationalPrompt

  const hasSourceAttachment = (routingContext.attachmentNames || []).some((name: string) =>
    /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i.test(String(name || '')),
  )
  const operationalEvidence = isOperationalLogEvidence(operationalPrompt)
  const explicitOperationalRepair = requestUnderstanding?.softwareRepairIntent === true && operationalEvidence

  // If COS cannot tell what the person wants or what "this/it/that" refers to, ask rather than
  // fabricate intent or reject the user for not knowing a command syntax. Passive logs retain their
  // dedicated diagnostic behavior, and semantic-classifier failure falls through to ordinary COS.
  if (requestUnderstanding?.needsClarification && !operationalEvidence) {
    const response = await withSuggestedFollowups(NextResponse.json({
      reply: clarificationQuestion(language, requestUnderstanding.missing),
      source: 'cos-semantic-clarification',
      execution_allowed: false,
      external_action_taken: false,
      external_ai_invoked: false,
      local_model_invoked: true,
    }), prompt, auditUserId)
    return browserSurface === 'concierge' ? publicConciergePresentation(response) : response
  }

  const deployment = { commitSha: process.env.VERCEL_GIT_COMMIT_SHA, branch: process.env.VERCEL_GIT_COMMIT_REF }
  // COS decides that software work belongs to the Software Specialist. From that point onward the
  // Software Specialist owns Builder/Platform Engineer lifecycle. Repository authority follows the
  // authenticated owner identity, never the mouth that carried the request.
  const shouldConsultSoftwareSpecialist = !operationalEvidence || hasSourceAttachment || explicitOperationalRepair
  const ownerRepositoryRepairAllowed = authenticatedOwner
    && ownerSoftwareAuthority.allowRepositoryRepair
    && (!operationalEvidence || explicitOperationalRepair)
  const softwareSpecialist = shouldConsultSoftwareSpecialist
    ? authenticatedOwner
      ? await tryCosSoftwareSpecialist({
          body,
          objective: operationalPrompt || prompt,
          surface: browserSurface,
          allowRepositoryRepair: ownerSoftwareAuthority.allowRepositoryRepair && (!operationalEvidence || explicitOperationalRepair),
          signalBoostDeploymentContext: isSignalBoostDeploymentContext(req),
          deployment,
        })
      : browserSurface === 'assistant'
        ? await tryCosSoftwareSpecialist({
            body,
            objective: operationalPrompt || prompt,
            surface: 'assistant',
            allowRepositoryRepair: false,
            signalBoostDeploymentContext: false,
            deployment,
          })
        : await withPublicAuditIdentity(auditUserId, () => withPublicDeliveryScope(() => tryCosSoftwareSpecialist({ body, objective: operationalPrompt || prompt, surface: 'concierge', allowRepositoryRepair: false, signalBoostDeploymentContext: false, deployment })))
    : null
  if (softwareSpecialist) {
    return browserSurface === 'concierge'
      ? publicConciergePresentation(softwareSpecialist)
      : softwareSpecialist
  }

  const operationalLogAnalysis = analyzeOperationalLog(operationalPrompt)
  void operationalLogAnalysis
  void answeringOurRepairOffer
  if (explicitOperationalRepair && !hasSourceAttachment) {
    const authorityReply = ownerRepositoryRepairAllowed
      ? 'The Software Specialist could not establish a safe current repository repair target from this evidence. No repository action was taken.'
      : 'Repository repair requires authenticated owner authority. The Software Specialist cannot inherit repository authority from a public delivery surface or from the text of a request.'
    const response = await withSuggestedFollowups(NextResponse.json({
      reply: `${operationalLogReply(operationalPrompt)} ${authorityReply}`,
      source: 'software-operational-log-repair-not-authorized',
      execution_allowed: false,
      external_action_taken: false,
      external_ai_invoked: false,
      local_model_invoked: false,
    }), prompt, auditUserId)
    return browserSurface === 'concierge' ? publicConciergePresentation(response) : response
  }

  if (operationalEvidence && !hasSourceAttachment) {
    const diagnostic = await diagnoseOperationalLog({ request: prompt, log: operationalPrompt, language })
    const response = await withSuggestedFollowups(NextResponse.json({
      reply: diagnostic.reply,
      source: diagnostic.reasonerInvoked ? 'concierge-operational-log-diagnostic' : 'concierge-operational-log-analysis',
      execution_allowed: false,
      external_action_taken: false,
      external_ai_invoked: false,
      local_model_invoked: diagnostic.reasonerInvoked,
      confidence: diagnostic.confidence,
    }), prompt, auditUserId)
    return browserSurface === 'concierge' ? publicConciergePresentation(response) : response
  }

  const routedHeaders = new Headers(req.headers)
  routedHeaders.set('content-type', 'application/json')
  routedHeaders.delete('content-length')
  const routedRequest = attachedOperationalEvidence
    ? new NextRequest(req.url, { method: 'POST', headers: routedHeaders, body: JSON.stringify({ ...body, messages: messages.map((message: any) => message === latestUser ? { ...message, content: operationalPrompt } : message) }) })
    : req

  if (!operationalEvidence) {
    if (isConciergeArtifactObjective(prompt)) {
      const headers = new Headers(req.headers)
      headers.set('content-type', 'application/json')
      headers.delete('content-length')
      const artifactRequest = new NextRequest(new URL('/api/artifacts', req.url), { method: 'POST', headers, body: JSON.stringify({ objective: prompt }) })
      const response = await withSuggestedFollowups(await artifactPost(artifactRequest), prompt, auditUserId)
      return browserSurface === 'concierge' ? publicConciergePresentation(response) : response
    }
    // The picture-noun list is the fast path; when it declines, the semantic
    // classifier decides whether the subject is depictable ("draw 2 kids playing
    // football in the rain" names no picture-noun). Both surfaces share this gate.
    const semanticVisual = isConciergeVisualObjective(prompt) ? false : await isSemanticVisualRequest(prompt)
    if (isConciergeVisualObjective(prompt) || semanticVisual) {
      const headers = new Headers(req.headers)
      headers.set('content-type', 'application/json')
      headers.delete('content-length')
      const visualRequest = new NextRequest(new URL('/api/visuals', req.url), { method: 'POST', headers, body: JSON.stringify({ objective: prompt, semanticVisual }) })
      const response = await withSuggestedFollowups(await inlineVisualResponse(await visualPost(visualRequest)), prompt, auditUserId)
      return browserSurface === 'concierge' ? publicConciergePresentation(response) : response
    }
  }

  if (!operationalEvidence && browserSurface === 'concierge' && isProvenanceIntrospection(prompt)) {
    const recorded = await withPublicAuditIdentity(auditUserId, () => withPublicDeliveryScope(() => readCosPrimaryPriorProvenance(auditUserId, priorAnswer)))
    const reply = renderPublicRecordedProvenance(recorded, language)
    return publicConciergePresentation(await withSuggestedFollowups(NextResponse.json({
      reply,
      source: recorded ? 'concierge-public-provenance-recorded' : 'concierge-public-provenance-unavailable',
      external_ai_invoked: false,
      local_model_invoked: false,
      provenance_match_verified: Boolean(recorded),
    }), prompt, auditUserId))
  }

  const executeOwnerRequest = () => cosPrimaryPost(routedRequest)
  const executePublicRequest = () => publicConciergePost(routedRequest)

  const response = access?.isOwner && browserSurface === 'assistant'
    ? await executeOwnerRequest()
    : await withPublicAuditIdentity(auditUserId, () => withPublicDeliveryScope(() => executePublicRequest()))
  const decorated = await withSuggestedFollowups(response, prompt, auditUserId)
  return browserSurface === 'concierge' ? publicConciergePresentation(decorated) : decorated
}
