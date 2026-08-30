import { NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { POST as legacyConciergePost } from '@/app/api/concierge/route'
import { POST as builderPost } from '@/app/api/builder/route'
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
import { isPastedOperationalLog } from '@/lib/ai/cos/pastedOperationalLog'
import { isConciergeArtifactObjective } from '@/lib/artifacts/intent'
import { isConciergeVisualObjective } from '@/lib/visuals/intent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    // Keep the artifact out of prose. The browser renders this owner-scoped image
    // from a structured field, so a markdown/parser change cannot turn it into a URL.
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


/**
 * Browser-only ingress wrapper for COS Primary.
 *
 * The stable /api/concierge endpoint is rewritten here by proxy.ts. This is therefore the REAL
 * public Concierge request boundary and must establish BOTH:
 *   1) request-scoped RunPod wake permission; and
 *   2) request-scoped public-delivery isolation.
 *
 * Public delivery isolation is applied before COS Primary performs auth, freshness routing,
 * reasoning, fallback, or persistence. Even if the browser belongs to the owner, nested access
 * checks see guest/public authority and COS cannot inherit owner/admin/private-company context.
 *
 * Authenticated internal artifact, visual, and owner repository-repair tools execute before that
 * boundary. Their routes repeat authorization and return only owner-scoped workspace artifacts.
 * A separately captured request-local audit identity carries only the authenticated user id into
 * public provenance persistence; it is not authorization context.
 *
 * Provenance introspection is special: it is a question about recorded execution history, not a
 * new reasoning task. The public reply therefore comes only from the preceding turn's recorded,
 * public-scoped provenance. If that exact record cannot be verified, the route fails closed rather
 * than asking a model to reconstruct its own history.
 *
 * Direct/server calls to /api/cos-primary do NOT pass through this wrapper and therefore are not
 * public Concierge traffic; they also cannot start a stopped RunPod unless separately authorized.
 */
export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const userMessages = messages.filter((message: any) => message?.role === 'user' && typeof message?.content === 'string')
  const latestUser = userMessages.at(-1)
  const prompt = typeof latestUser?.content === 'string' ? latestUser.content : ''
  const assistantMessages = messages.filter((message: any) => message?.role === 'assistant' && typeof message?.content === 'string')
  const priorAnswer = typeof assistantMessages.at(-1)?.content === 'string' ? assistantMessages.at(-1).content : ''
  const language = ['en', 'es', 'pt', 'pl', 'ru'].includes(String(body?.context?.language || '').toLowerCase())
    ? String(body.context.language).toLowerCase()
    : 'en'

  // Capture real authorization and correlation identity BEFORE entering public-delivery scope.
  // Public COS still receives only guest authority after the boundary starts.
  const access = await getAccess().catch(() => null)
  const auditUserId = access?.userId ?? null

  // Artifact creation is an authenticated internal Concierge tool. It must run before
  // public-delivery isolation so the private workspace remains owned by the real user.
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

  // Visual creation also needs the authenticated workspace owner. It must run before the
  // public-delivery boundary, while the returned file remains owner-scoped and private.
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

  // A failed SignalBoost build log is executable owner repair work, not ordinary public chat.
  // Builder repeats owner authorization, pins the exact commit, and produces only a reviewable
  // workspace patch; it cannot commit, merge, or deploy.
  if (isPastedOperationalLog(prompt) && access?.isOwner) {
    const headers = new Headers(req.headers)
    headers.set('content-type', 'application/json')
    headers.delete('content-length')
    const builderRequest = new NextRequest(new URL('/api/builder', req.url), {
      method: 'POST',
      headers,
      body: JSON.stringify({ objective: prompt }),
    })
    return withSuggestedFollowups(await builderPost(builderRequest), prompt, auditUserId)
  }

  // Source/provenance questions must never be generated by a model. Read the exact preceding
  // public turn record and render only public-safe facts from that record. A content mismatch,
  // absent audit identity, missing row, or wrong delivery scope returns null and therefore fails
  // closed instead of fabricating an origin such as "my training" or "illustrative sources".
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
      withRunpodWakePermission(permission, () => isConciergeBuilderObjective(prompt) ? legacyConciergePost(req) : cosPrimaryPost(req)),
    ),
  )
  return withSuggestedFollowups(response, prompt, auditUserId)
}
