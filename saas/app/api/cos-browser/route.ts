import { NextRequest, NextResponse } from 'next/server'
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
import { isConciergeArtifactObjective } from '@/lib/artifacts/intent'
import { classifyVisualRequest } from '@/lib/visuals/requestClassifier'
import { hasUserReferenceImage } from '@/lib/visuals/userReference'

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

function inlineVisualResponse(response: Response, appendPreviewToReply = false): Promise<NextResponse> {
  return response.clone().json().then((payload: any) => {
    const workspaceId = typeof payload?.workspaceId === 'string' ? payload.workspaceId : ''
    const imagePath = Array.isArray(payload?.files)
      ? payload.files.find((path: unknown): path is string => typeof path === 'string' && /\.(?:png|jpe?g|webp)$/i.test(path))
      : ''
    if (!workspaceId || !imagePath || typeof payload?.reply !== 'string') return NextResponse.json(payload, { status: response.status })
    const previewUrl = `/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${imagePath.split('/').map(encodeURIComponent).join('/')}?preview=1`
    return NextResponse.json({
      ...payload,
      reply: appendPreviewToReply ? `${payload.reply}\n\n${previewUrl}` : payload.reply,
      visual: {
        previewUrl,
        downloadUrl: previewUrl.replace('?preview=1', ''),
        alt: typeof payload?.generated_visual_label === 'string' ? payload.generated_visual_label : 'Generated visual',
      },
    }, { status: response.status })
  }).catch(() => new NextResponse(response.body, { status: response.status, headers: response.headers }))
}

function latestUserPrompt(messages: any[]): string {
  const latestUser = [...messages].reverse().find((message: any) => message?.role === 'user')
  if (typeof latestUser?.content === 'string') return latestUser.content
  if (Array.isArray(latestUser?.content)) {
    return latestUser.content
      .map((part: any) => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join(' ')
      .trim()
  }
  return ''
}

/**
 * Browser-only ingress wrapper for COS Primary.
 *
 * Public delivery isolation is applied before COS Primary performs auth, freshness routing,
 * reasoning, fallback, or persistence. Authenticated artifact and visual tools execute before that
 * boundary. Build/runtime logs remain ordinary analysis input and never receive Builder authority.
 */
export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const prompt = latestUserPrompt(messages)
  const assistantMessages = messages.filter((message: any) => message?.role === 'assistant' && typeof message?.content === 'string')
  const priorAnswer = typeof assistantMessages.at(-1)?.content === 'string' ? assistantMessages.at(-1).content : ''
  const language = ['en', 'es', 'pt', 'pl', 'ru'].includes(String(body?.context?.language || '').toLowerCase())
    ? String(body.context.language).toLowerCase()
    : 'en'

  // Capture correlation identity before entering public-delivery scope. Only the user id is carried
  // forward; it does not grant internal tool authority inside public COS execution.
  const auditUserId = (await getAccess().catch(() => null))?.userId ?? null

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

  const visualClassification = classifyVisualRequest({
    objective: prompt,
    hasUserReferenceImage: hasUserReferenceImage(body),
  })
  if (visualClassification) {
    const headers = new Headers(req.headers)
    headers.set('content-type', 'application/json')
    headers.delete('content-length')
    const visualRequest = new NextRequest(new URL('/api/visuals', req.url), {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, objective: prompt }),
    })
    const appendPreviewToReply = body?.context?.cosMode === 'silent_background_planning'
    return withSuggestedFollowups(
      await inlineVisualResponse(await visualPost(visualRequest), appendPreviewToReply),
      prompt,
      auditUserId,
    )
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
      withRunpodWakePermission(permission, () => isConciergeBuilderObjective(prompt) ? legacyConciergePost(req) : cosPrimaryPost(req)),
    ),
  )
  return withSuggestedFollowups(response, prompt, auditUserId)
}
