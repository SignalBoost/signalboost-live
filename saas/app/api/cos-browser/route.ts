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
  hasExplicitOperationalLogRepairIntent,
  isExplicitOperationalLogRepairRequest,
  isOperationalLogEvidence,
  isPastedOperationalLog,
  operationalLogReply,
} from '@/lib/ai/cos/pastedOperationalLog'
import { diagnoseOperationalLog } from '@/lib/ai/cos/operationalLogDiagnostic'
import { isOperationalLogRepairOffer } from '@/lib/ai/cos/pastedOperationalLog'
import { isRepairConfirmation } from '@/lib/ai/cos/repairConfirmationIntent'
import { isConciergeArtifactObjective } from '@/lib/artifacts/intent'
import { isConciergeVisualObjective } from '@/lib/visuals/intent'
import { resolveSemanticVisualRequest } from '@/lib/visuals/semanticIntent'
import { publicConciergeIdentityReply, publicConciergeIdentityReplyForIntent } from '@/lib/ai/cos/publicConciergeIdentity'
import { resolveSemanticPublicIdentity } from '@/lib/ai/cos/publicConciergeIdentityIntent'
import { PUBLIC_BRAND, PUBLIC_BRAND_DOMAIN } from '@/lib/public-brand'
import { readAttachedOperationalEvidence } from '@/lib/ai/cos/attachedOperationalEvidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// The Concierge primary answer is bounded (150s) and returns an honest timeout reply on its own.
// The deep-semantic ROUTING classifiers that run before it (public identity, visual continuation)
// were not bounded at all: each is a full reasoner turn (draft + optional repair, up to
// LOCAL_AI_TIMEOUT_MS per model call). When the model endpoint is slow, those two routing calls
// alone consumed the time the answer needed, Vercel killed the function at maxDuration, and the
// browser was left with "the page stopped waiting". A routing classifier is a short JSON verdict;
// if it has not decided within this window it is abandoned and the request falls through to the
// normal answer path — exactly what happens today when the classifier returns no verdict.
const ROUTING_CLASSIFIER_DEFAULT_MS = 15_000
const ROUTING_CLASSIFIER_MIN_MS = 2_000
const ROUTING_CLASSIFIER_MAX_MS = 30_000

function routingClassifierDeadlineMs(): number {
  const configured = Number(process.env.COS_ROUTING_CLASSIFIER_TIMEOUT_MS)
  if (!Number.isFinite(configured) || configured <= 0) return ROUTING_CLASSIFIER_DEFAULT_MS
  return Math.min(ROUTING_CLASSIFIER_MAX_MS, Math.max(ROUTING_CLASSIFIER_MIN_MS, Math.floor(configured)))
}

async function boundedRoutingClassifier<T>(stage: string, run: () => Promise<T | null>): Promise<T | null> {
  const deadlineMs = routingClassifierDeadlineMs()
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<'expired'>((resolve) => {
    timer = setTimeout(() => resolve('expired'), deadlineMs)
  })
  try {
    const outcome = await Promise.race([
      run().catch(() => null),
      expired,
    ])
    if (outcome === 'expired') {
      console.warn('[cos-browser-routing-deadline]', JSON.stringify({
        at: new Date().toISOString(),
        stage,
        deadlineMs,
        action: 'classifier_abandoned_request_continues_to_answer_path',
      }))
      return null
    }
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs > deadlineMs / 2) {
      console.info('[cos-browser-routing-latency]', JSON.stringify({ at: new Date().toISOString(), stage, elapsedMs, deadlineMs }))
    }
    return outcome
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// COS is the private reasoning/orchestration layer. This object represents an authenticated owner
// capability, not a UI-surface capability. Concierge and Assistant are delivery surfaces; neither
// is allowed to manufacture authority, and neither is the software execution controller.
const ownerSoftwareAuthority = Object.freeze({ allowRepositoryRepair: true })

function isSignalBoostDeploymentContext(req: NextRequest): boolean {
  const owner = String(process.env.VERCEL_GIT_REPO_OWNER || '').trim().toLowerCase()
  const repo = String(process.env.VERCEL_GIT_REPO_SLUG || '').trim().toLowerCase()
  const host = String(req.nextUrl.hostname || '').trim().toLowerCase()
  return (owner === 'signalboost' && repo === 'signalboost-live') || host === PUBLIC_BRAND_DOMAIN || host === 'saas.signalboostapp.com'
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
      .replace(/\bCOS\b/g, PUBLIC_BRAND.name)
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
    const existingPreview = typeof payload?.visual?.previewUrl === 'string' ? payload.visual.previewUrl : ''
    if (existingPreview) return NextResponse.json(payload, { status: response.status })
    const workspaceId = typeof payload?.workspaceId === 'string' ? payload.workspaceId : ''
    const imagePath = Array.isArray(payload?.files)
      ? payload.files.find((path: unknown): path is string => typeof path === 'string' && /\.(?:png|jpe?g|webp)$/i.test(path))
      : ''
    if (!workspaceId || !imagePath || typeof payload?.reply !== 'string') {
      if (response.ok && String(payload?.source || '').startsWith('concierge-visual')) {
        return NextResponse.json({
          error: 'visual_delivery_unverified',
          reply: 'The visual could not be verified for inline display and download, so I will not claim it was delivered. Please try again.',
          source: 'concierge-visual-delivery-unverified',
          execution_allowed: false,
          external_action_taken: false,
        }, { status: 502 })
      }
      return NextResponse.json(payload, { status: response.status })
    }
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
  const latestUserIndex = messages.lastIndexOf(latestUser)
  const immediatePreviousMessage = latestUserIndex > 0 ? messages[latestUserIndex - 1] : null
  const assistantMessages = messages.filter((message: any) => message?.role === 'assistant' && typeof message?.content === 'string')
  const priorAnswer = typeof assistantMessages.at(-1)?.content === 'string' ? assistantMessages.at(-1).content : ''
  const language = ['en', 'es', 'pt', 'pl', 'ru'].includes(String(body?.context?.language || '').toLowerCase())
    ? String(body.context.language).toLowerCase()
    : 'en'

  const access = await getAccess().catch(() => null)
  const auditUserId = access?.userId ?? null
  const browserSurface: 'concierge' | 'assistant' = req.headers.get('x-signalboost-surface') === 'cos' ? 'assistant' : 'concierge'
  const authenticatedOwner = access?.isOwner === true && Boolean(access.userId)

  if (browserSurface === 'concierge') {
    const deterministicIdentity = publicConciergeIdentityReply(prompt)
    const semanticIdentity = deterministicIdentity
      ? null
      : await boundedRoutingClassifier('public_identity', () => resolveSemanticPublicIdentity(prompt))
    const identity = deterministicIdentity || (semanticIdentity
      ? publicConciergeIdentityReplyForIntent(semanticIdentity.intent, semanticIdentity.language)
      : null)
    if (identity) {
      return publicConciergePresentation(await withSuggestedFollowups(NextResponse.json({
        ...identity,
        identity_routing: deterministicIdentity ? 'deterministic' : 'deep-semantic',
        external_ai_invoked: false,
        local_model_invoked: semanticIdentity !== null,
        execution_allowed: false,
        external_action_taken: false,
      }), prompt, auditUserId))
    }
  }

  const routingContext = builderRoutingContextFromBody(body)
  const attachedOperationalEvidence = readAttachedOperationalEvidence(body?.attachments)
  const currentOperationalPrompt = attachedOperationalEvidence ? `${prompt}\n\n${attachedOperationalEvidence}`.trim() : prompt

  // The real browser transport posts directly to this canonical route. Preserve the natural
  // passive-log -> diagnostic -> "fix it" contract server-side rather than relying on a second
  // client wrapper. For repository repair, keep both immutable branch/commit evidence from the log
  // head and the actual failing assertions from its tail inside Builder's 64k durable objective cap.
  // A person answering an offer says "yes", "go", "please", "tak", "да" — or swears at
  // it. The keyword path stays as the fast, zero-cost route; when it declines, the
  // network reads the reply as consent or not. This is consulted ONLY when the prior
  // assistant turn was our own repair offer and the turn before it was passive log
  // evidence, so a log still cannot authorise itself and no authority is widened.
  const followupOperationalRepair = hasExplicitOperationalLogRepairIntent(prompt)
    && isPastedOperationalLog(previousUserPrompt)
  const answeringOurRepairOffer = !followupOperationalRepair
    && isPastedOperationalLog(previousUserPrompt)
    && isOperationalLogRepairOffer(priorAnswer)
  const confirmedRepairOffer = answeringOurRepairOffer && await isRepairConfirmation(prompt)
  const reverseImmediateOperationalRepair = isPastedOperationalLog(prompt)
    && immediatePreviousMessage?.role === 'user'
    && typeof immediatePreviousMessage?.content === 'string'
    && hasExplicitOperationalLogRepairIntent(immediatePreviousMessage.content)
  const operationalPrompt = followupOperationalRepair || confirmedRepairOffer
    ? `${prompt.trim()}\n\n${compactOperationalLogForRepair(previousUserPrompt)}`
    : currentOperationalPrompt

  const hasSourceAttachment = (routingContext.attachmentNames || []).some((name: string) =>
    /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i.test(String(name || '')),
  )
  const operationalEvidence = isOperationalLogEvidence(operationalPrompt)
  const explicitOperationalRepair = isExplicitOperationalLogRepairRequest(operationalPrompt)
    || reverseImmediateOperationalRepair
    || confirmedRepairOffer

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

    // Obvious visual requests still take the deterministic zero-cost fast path. Everything
    // ambiguous — including follow-up language — is decided by the deep semantic reasoner using
    // bounded recent user-authored conversation context. Deterministic code only validates and
    // preserves the user's exact words; it does not infer the continuation itself.
    const directVisual = isConciergeVisualObjective(prompt)
    const semanticResolution = directVisual
      ? null
      : await boundedRoutingClassifier('visual_continuation', () => resolveSemanticVisualRequest(messages, prompt))
    const visualObjective = directVisual ? prompt : semanticResolution?.objective ?? null
    if (visualObjective) {
      const headers = new Headers(req.headers)
      headers.set('content-type', 'application/json')
      headers.delete('content-length')
      const semanticVisual = !directVisual
      const visualRequest = new NextRequest(new URL('/api/visuals', req.url), { method: 'POST', headers, body: JSON.stringify({ objective: visualObjective, semanticVisual }) })
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
