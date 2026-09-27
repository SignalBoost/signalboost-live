// saas/app/api/cos-browser/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
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
import { resolveSemanticVisualRequest, shouldResolveSemanticVisualRequest } from '@/lib/visuals/semanticIntent'
import { publicConciergeIdentityReply, publicConciergeIdentityReplyForIntent } from '@/lib/ai/cos/publicConciergeIdentity'
import { resolveSemanticPublicIdentity, shouldResolveSemanticPublicIdentity } from '@/lib/ai/cos/publicConciergeIdentityIntent'
import { PUBLIC_BRAND, PUBLIC_BRAND_DOMAIN } from '@/lib/public-brand'
import { readAttachedOperationalEvidence } from '@/lib/ai/cos/attachedOperationalEvidence'
import { detectDirectTextTransformation } from '@/lib/ai/cos/directTextTransformation'
import { isAuthoringObjectiveWithoutLiveLookup, isCosCodingObjective } from '@/lib/ai/cos/cosReasoningRolePolicy'
import { decideCosAgentTurn, type CosAgentDecision } from '@/lib/ai/cos/cosAgentDecision'
import { isPlatformSelfKnowledgePrompt, requiresFreshExternalEvidence, requiresLiveTravelPlanningEvidence } from '@/lib/ai/cos/cosFreshnessPolicy'
import { isSignalBoostSpecificPublicRequest } from '@/lib/ai/cos/publicScenarioScope'
import { mentionsPlatformConcept } from '@/lib/ai/cos/cosPlatformGlossary'
import { publicDisclosureViolations } from '@/lib/ai/cos/publicDisclosureGate'
import { hasUnsafePublicModelOutput } from '@/lib/ai/cos/publicPromptSecurity'
import { resolveResponseLanguage } from '@/lib/i18n/responseLanguage'

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
  if (payload.agent_decision) delete payload.agent_decision
  return NextResponse.json(payload, { status: response.status, headers })
}

async function withAgentDecisionMetadata(response: Response, decision: CosAgentDecision | null): Promise<NextResponse> {
  if (!decision) return response instanceof NextResponse
    ? response
    : new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  let payload: any
  try { payload = await response.clone().json() } catch {
    return new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  if (!payload || typeof payload !== 'object') return NextResponse.json(payload, { status: response.status, headers })
  payload.agent_decision = {
    mode: decision.mode,
    capabilities: decision.capabilities,
    confidence: decision.confidence,
    reason: decision.reason,
    reasoner: decision.reasonerLabel,
  }
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
  const language = resolveResponseLanguage(prompt, body?.context?.language)
  const ingressStartedAt = Date.now()
  let semanticIdentityInvoked = false
  let semanticVisualInvoked = false
  const browserSurface: 'concierge' | 'assistant' = req.headers.get('x-signalboost-surface') === 'cos' ? 'assistant' : 'concierge'
  const hasAttachments = Array.isArray(body?.attachments) && body.attachments.length > 0

  // Explicit text transformations are fully scoped by the user's command and supplied source.
  // They require no identity/visual/software classification and no privileged authority. Execute
  // the bounded editor immediately on BOTH Concierge and Assistant so the homepage cannot spend
  // ~30 seconds on unrelated semantic classifiers before the edit model call.
  const directTextTransformation = detectDirectTextTransformation(prompt)
  const directTextHasAttachments = hasAttachments
  if (directTextTransformation && !directTextHasAttachments) {
    // There is one editor capability, inside canonical COS. Browser ingress must never run a
    // competing editor and fail the turn before COS gets a chance to use its proven fast lane.
    const directAccess = await getAccess().catch(() => null)
    const directAuditUserId = directAccess?.userId ?? null
    const executeDirect = () => cosPrimaryPost(req)
    const response = directAccess?.isOwner && browserSurface === 'assistant'
      ? await executeDirect()
      : await withPublicAuditIdentity(directAuditUserId, () => withPublicDeliveryScope(() => executeDirect()))
    return browserSurface === 'concierge'
      ? publicConciergePresentation(response)
      : response
  }

  const access = await getAccess().catch(() => null)
  const auditUserId = access?.userId ?? null
  const authenticatedOwner = access?.isOwner === true && Boolean(access.userId)
  const routingContext = builderRoutingContextFromBody(body)

  // Self-contained writing/translation is already a complete COS objective. Do not spend the
  // interactive response budget asking unrelated public identity, Software Specialist, or visual
  // classifiers to reinterpret it. This is not a separate Concierge brain: both surfaces still
  // execute cosPrimaryPost; public Concierge retains public audit/delivery scope and presentation.
  const fastAuthoringIngress = !directTextHasAttachments
    && isAuthoringObjectiveWithoutLiveLookup(prompt)
    && !isCosCodingObjective(prompt, routingContext)
    && !isConciergeArtifactObjective(prompt)
    && !isConciergeVisualObjective(prompt)
    && !isProvenanceIntrospection(prompt)
    && !isOperationalLogEvidence(prompt)
  if (fastAuthoringIngress) {
    const executeAuthoring = () => cosPrimaryPost(req)
    const authoringResponse = access?.isOwner && browserSurface === 'assistant'
      ? await executeAuthoring()
      : await withPublicAuditIdentity(auditUserId, () => withPublicDeliveryScope(() => executeAuthoring()))
    return browserSurface === 'concierge'
      ? publicConciergePresentation(authoringResponse)
      : authoringResponse
  }

  if (browserSurface === 'concierge') {
    const deterministicIdentity = publicConciergeIdentityReply(prompt)
    const semanticIdentityEligible = !deterministicIdentity && shouldResolveSemanticPublicIdentity(prompt)
    semanticIdentityInvoked = semanticIdentityEligible
    const semanticIdentity = semanticIdentityEligible ? await resolveSemanticPublicIdentity(prompt) : null
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
  const shouldConsultSoftwareSpecialist = hasSourceAttachment || explicitOperationalRepair
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
  const routedBody = attachedOperationalEvidence
    ? { ...body, messages: messages.map((message: any) => message === latestUser ? { ...message, content: operationalPrompt } : message) }
    : body
  let routedRequest = new NextRequest(req.url, { method: 'POST', headers: routedHeaders, body: JSON.stringify(routedBody) })

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
    const semanticVisualEligible = !directVisual
      && browserSurface === 'concierge'
      && shouldResolveSemanticVisualRequest(messages, prompt)
    semanticVisualInvoked = semanticVisualEligible
    const semanticResolution = semanticVisualEligible
      ? await resolveSemanticVisualRequest(messages, prompt)
      : null
    const visualObjective = browserSurface === 'assistant'
      ? null
      : directVisual ? prompt : semanticResolution?.objective ?? null
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

  // MODEL-FIRST AGENT LOOP: after hard host/security/surface special cases, the primary model sees
  // every ordinary request before optional capability routing. It either answers now or requests the
  // minimum native capability needed. Mutable/current requests still have the host freshness backstop
  // below, but that guard runs only after the model's first semantic decision.
  let agentDecision: CosAgentDecision | null = null
  // Questions about this service itself (iTMounts, its products, COS and its platform concepts) must be
  // answered by the COS pipeline, which holds the owner-approved identity and glossary. The first-turn
  // model has neither: Production 2026-09-26 answered "What is iTMounts?" directly from model memory as
  // "a digital mount management system".
  const asksAboutThisService = isSignalBoostSpecificPublicRequest(prompt)
    || (browserSurface !== 'concierge' && authenticatedOwner && mentionsPlatformConcept(prompt))
  if (!operationalEvidence && !hasSourceAttachment && !explicitOperationalRepair && !isPlatformSelfKnowledgePrompt(prompt) && !asksAboutThisService) {
    agentDecision = await decideCosAgentTurn({
      prompt,
      previousAssistant: priorAnswer || null,
      surface: browserSurface,
      ownerAuthenticated: authenticatedOwner,
      language,
    })
  }

  // The model gets first semantic choice. Host policy may still require MORE evidence before release.
  // This is a release guard, not a pre-model router: when the model misses a mutable/current-world
  // dependency, force the same turn into live_web orchestration rather than releasing stale memory.
  if (agentDecision?.mode === 'answer' && (requiresFreshExternalEvidence(prompt) || requiresLiveTravelPlanningEvidence(prompt))) {
    console.info('[cos-agent-decision]', JSON.stringify({
      at: new Date().toISOString(),
      mode: 'orchestrate',
      capabilities: ['live_web'],
      confidence: agentDecision.confidence,
      reason: 'host_freshness_guard',
      reasoner: agentDecision.reasonerLabel,
      decisionMs: Math.max(0, Date.now() - ingressStartedAt),
    }))
    agentDecision = {
      mode: 'orchestrate',
      answer: '',
      confidence: Math.max(0.55, agentDecision.confidence),
      capabilities: ['live_web'],
      reason: 'host_freshness_guard',
      reasonerLabel: agentDecision.reasonerLabel,
    }
  }

  if (agentDecision?.mode === 'answer' && agentDecision.confidence >= 0.55) {
    const publicUnsafe = browserSurface === 'concierge'
      && (hasUnsafePublicModelOutput(agentDecision.answer) || publicDisclosureViolations(agentDecision.answer).length > 0)
    if (!publicUnsafe) {
      console.info('[cos-agent-decision]', JSON.stringify({
        at: new Date().toISOString(),
        mode: 'answer',
        capabilities: [],
        confidence: agentDecision.confidence,
        reasoner: agentDecision.reasonerLabel,
        decisionMs: Math.max(0, Date.now() - ingressStartedAt),
      }))
      const executionProvenance = {
        schema_version: 4,
        authority: 'server_execution_telemetry',
        model_generated: false,
        agent_decision: {
          mode: 'answer',
          capabilities: [],
          reason: agentDecision.reason,
          confidence: agentDecision.confidence,
        },
        local_reasoning: {
          invoked: true,
          model: agentDecision.reasonerLabel,
          confidence: agentDecision.confidence,
        },
        external_ai: { invoked: false },
      }
      const direct = await withAgentDecisionMetadata(NextResponse.json({
        ok: true,
        reply: agentDecision.answer,
        source: 'cos-model-direct',
        confidence_score: agentDecision.confidence,
        external_ai_invoked: false,
        external_fallback_invoked: false,
        local_model_invoked: true,
        execution_provenance: executionProvenance,
        execution_allowed: false,
        external_action_taken: false,
      }), agentDecision)
      const decorated = await withSuggestedFollowups(direct, prompt, auditUserId)
      return browserSurface === 'concierge' ? publicConciergePresentation(decorated) : decorated
    }
    console.warn('[cos-agent-decision] public direct answer rejected by disclosure/security gate')
    agentDecision = null
  }

  if (agentDecision?.mode === 'orchestrate') {
    console.info('[cos-agent-decision]', JSON.stringify({
      at: new Date().toISOString(),
      mode: 'orchestrate',
      capabilities: agentDecision.capabilities,
      confidence: agentDecision.confidence,
      reason: agentDecision.reason,
      reasoner: agentDecision.reasonerLabel,
      decisionMs: Math.max(0, Date.now() - ingressStartedAt),
    }))

    // Software/repository capability requests are handoffs, not authority grants. The existing
    // Software Specialist re-checks owner identity and repository permissions before any action.
    if (agentDecision.capabilities.includes('software_specialist') || agentDecision.capabilities.includes('repository_read')) {
      const specialist = authenticatedOwner
        ? await tryCosSoftwareSpecialist({
            body,
            objective: prompt,
            surface: browserSurface,
            allowRepositoryRepair: ownerSoftwareAuthority.allowRepositoryRepair,
            signalBoostDeploymentContext: isSignalBoostDeploymentContext(req),
            deployment,
          })
        : browserSurface === 'assistant'
          ? await tryCosSoftwareSpecialist({
              body,
              objective: prompt,
              surface: 'assistant',
              allowRepositoryRepair: false,
              signalBoostDeploymentContext: false,
              deployment,
            })
          : await withPublicAuditIdentity(auditUserId, () => withPublicDeliveryScope(() => tryCosSoftwareSpecialist({
              body,
              objective: prompt,
              surface: 'concierge',
              allowRepositoryRepair: false,
              signalBoostDeploymentContext: false,
              deployment,
            })))
      if (specialist) {
        const annotated = await withAgentDecisionMetadata(specialist, agentDecision)
        return browserSurface === 'concierge' ? publicConciergePresentation(annotated) : annotated
      }
    }

    routedHeaders.set('x-signalboost-agent-mode', 'orchestrate')
    routedHeaders.set('x-signalboost-agent-capabilities', agentDecision.capabilities.join(','))
    routedHeaders.set('x-signalboost-agent-confidence', String(agentDecision.confidence))
    routedRequest = new NextRequest(req.url, { method: 'POST', headers: routedHeaders, body: JSON.stringify(routedBody) })
  }

  // ANSWERABILITY FIRST: ordinary questions reach COS before optional semantic routers. The
  // routers above are admitted only when the request is identity/visual-shaped. This timestamp
  // makes it visible whether time was spent understanding/routing or actually answering.
  console.info('[cos-answerability-first]', JSON.stringify({
    at: new Date().toISOString(),
    stage: 'local_answer_attempt',
    answerability: 'model_knowledge_or_reasoning_candidate',
    preAnswerRoutingMs: Math.max(0, Date.now() - ingressStartedAt),
    semanticIdentityInvoked,
    semanticVisualInvoked,
    promptChars: prompt.length,
  }))

  // ONE BRAIN: Assistant is the owner's COS interface; Concierge is only the public mouth.
  // Both surfaces execute the same COS reasoning endpoint. Public scope changes authority,
  // memory/tool visibility, disclosure, and presentation — never which brain answers.
  const executeCosRequest = () => cosPrimaryPost(routedRequest)
  let response = access?.isOwner && browserSurface === 'assistant'
    ? await executeCosRequest()
    : await withPublicAuditIdentity(auditUserId, () => withPublicDeliveryScope(() => executeCosRequest()))
  response = await withAgentDecisionMetadata(response, agentDecision)

  try {
    const outcome: any = await response.clone().json()
    const answerability = outcome?.live_evidence_retrieved_this_turn === true
      ? 'fresh_verification_required'
      : outcome?.external_fallback_invoked === true
        ? 'local_answer_insufficient'
        : String(outcome?.reply || '').trim()
          ? 'local_answer_available'
          : 'unresolved'
    console.info('[cos-answerability-outcome]', JSON.stringify({
      at: new Date().toISOString(),
      answerability,
      source: String(outcome?.source || ''),
      confidence: Number.isFinite(Number(outcome?.confidence_score)) ? Number(outcome.confidence_score) : null,
      localModelInvoked: outcome?.local_model_invoked === true,
      externalFallbackInvoked: outcome?.external_fallback_invoked === true,
      totalMs: Math.max(0, Date.now() - ingressStartedAt),
    }))
  } catch {}

  const decorated = await withSuggestedFollowups(response, prompt, auditUserId)
  return browserSurface === 'concierge' ? publicConciergePresentation(decorated) : decorated
}
