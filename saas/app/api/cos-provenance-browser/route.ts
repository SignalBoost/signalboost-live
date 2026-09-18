import { after, NextRequest, NextResponse } from 'next/server'
import { POST as cosBrowserPost } from '@/app/api/cos-browser/route'
import { getAccess } from '@/lib/auth/access'
import { isProvenanceIntrospection } from '@/lib/ai/cos/cosOrchestration'
import { ensureAnswerExecutionProvenance } from '@/lib/ai/cos/answerProvenance.ts'
import { provenanceBoundarySecret } from '@/lib/ai/cos/provenanceBoundarySecret.ts'
import {
  createPublicAnswerProvenanceCapsule,
  publicAnswerCapsuleAsRecordedProvenance,
  verifyPublicAnswerProvenanceCapsule,
} from '@/lib/ai/cos/publicAnswerProvenanceCapsule.ts'
import { renderPublicRecordedProvenance } from '@/lib/ai/cos/publicRecordedProvenance.ts'
import { recordLatestUserTurnProvenance } from '@/lib/ai/cos/supportTurnProvenance.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PROVENANCE_COOKIE = 'sb_answer_provenance'
const PROVENANCE_BOUNDARY_HEADER = 'x-signalboost-provenance-boundary'
const MAX_PROVENANCE_COOKIE_CHARS = 3600

type BrowserMessage = {
  role?: unknown
  content?: unknown
  answerProvenance?: unknown
  answer_provenance?: unknown
}

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages as BrowserMessage[] : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && typeof message.content === 'string') return message.content.trim()
  }
  return ''
}

function precedingAssistant(body: any): BrowserMessage | null {
  const messages = Array.isArray(body?.messages) ? body.messages as BrowserMessage[] : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'assistant' && typeof message.content === 'string' && message.content.trim()) return message
  }
  return null
}

function languageFrom(body: any): string {
  const language = String(body?.context?.language || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(language) ? language : 'en'
}

function publicSurface(req: NextRequest): boolean {
  return req.headers.get('x-signalboost-surface') !== 'cos'
}

function withJsonPayload(response: Response, payload: any): NextResponse {
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.set('cache-control', 'no-store, max-age=0')
  return NextResponse.json(payload, { status: response.status, headers })
}

function encodeCapsuleCookie(value: unknown): string | null {
  try {
    const encoded = Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
    return encoded.length <= MAX_PROVENANCE_COOKIE_CHARS ? encoded : null
  } catch {
    return null
  }
}

function decodeCapsuleCookie(req: NextRequest): unknown {
  const value = req.cookies.get(PROVENANCE_COOKIE)?.value || ''
  if (!value || value.length > MAX_PROVENANCE_COOKIE_CHARS) return null
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function trustedBoundaryRequest(req: NextRequest): boolean {
  const expected = provenanceBoundarySecret()
  const supplied = req.headers.get(PROVENANCE_BOUNDARY_HEADER) || ''
  return Boolean(expected && supplied && supplied === expected)
}

function downstreamRequest(req: NextRequest, body: any): NextRequest {
  const headers = new Headers(req.headers)
  headers.delete(PROVENANCE_BOUNDARY_HEADER)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')
  return new NextRequest(req.url, { method: 'POST', headers, body: JSON.stringify(body) })
}

async function finalizeAnswer(response: Response, req: NextRequest, body: any): Promise<Response> {
  let payload: any
  try { payload = await response.clone().json() } catch { return response }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return response
  const reply = typeof payload.reply === 'string' ? payload.reply.trim() : ''
  if (!reply) return response

  const provenance = ensureAnswerExecutionProvenance(payload)
  const isPublic = publicSurface(req)
  const scopedProvenance = {
    ...provenance,
    delivery_scope: isPublic ? 'public_concierge' : 'owner_assistant',
    audit_identity: isPublic
      ? { binding: 'server_authenticated_user_id_or_signed_capsule', authorization_authority: false, exposed_to_reasoning: false }
      : (provenance as any)?.audit_identity,
  }
  const answerProvenance = createPublicAnswerProvenanceCapsule(
    { ...payload, execution_provenance: scopedProvenance },
    reply,
  )
  const publicProvenance = publicAnswerCapsuleAsRecordedProvenance(answerProvenance)

  // Durable account-bound record when a signed-in identity exists. Anonymous preview users still
  // receive a signed, answer-bound capsule. The most recent capsule is also kept in an HttpOnly
  // same-site cookie so the natural next-turn question "where did that come from?" works without
  // forcing trial users to create an account or trusting model memory/client-authored provenance.
  // Provenance persistence must never delay delivery of an already-completed answer.
  // Resolve account identity and write the durable record after the response leaves the critical
  // path. Signed answer provenance is still attached synchronously below, so delivery integrity
  // does not depend on Supabase availability.
  after(async () => {
    const access = await getAccess().catch(() => null)
    const userId = access?.userId || null
    if (!userId) return
    await recordLatestUserTurnProvenance(
      userId,
      reply,
      scopedProvenance,
      String(payload.source || 'browser-delivery'),
    ).catch(() => false)
  })

  const delivered = withJsonPayload(response, {
    ...payload,
    execution_provenance: isPublic ? publicProvenance : (payload.execution_provenance ?? scopedProvenance),
    answer_provenance: answerProvenance,
  })

  if (isPublic && answerProvenance.signed) {
    const cookie = encodeCapsuleCookie(answerProvenance)
    if (cookie) {
      delivered.cookies.set(PROVENANCE_COOKIE, cookie, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60,
      })
    }
  }
  return delivered
}

export async function POST(req: NextRequest): Promise<Response> {
  // This route is an internal network boundary, not a second public assistant endpoint. The proxy
  // injects a server-only secret after applying spend/routing policy. A direct request fails closed.
  if (!trustedBoundaryRequest(req)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const body = await req.clone().json().catch(() => ({}))
  const prompt = latestUserText(body)
  const prior = precedingAssistant(body)

  // Public users may be in trial mode with no account row yet. Prefer a cryptographically verified
  // capsule carried with the exact preceding assistant message; when the UI does not carry hidden
  // response metadata, use the HttpOnly capsule cookie issued with that same preceding response.
  // Both paths are accepted only when the HMAC verifies AND the answer hash matches the exact text.
  if (publicSurface(req) && prompt && isProvenanceIntrospection(prompt) && prior && typeof prior.content === 'string') {
    const suppliedCapsule = prior.answerProvenance ?? prior.answer_provenance ?? decodeCapsuleCookie(req)
    const verified = verifyPublicAnswerProvenanceCapsule(suppliedCapsule, prior.content)
    if (verified) {
      const recorded = publicAnswerCapsuleAsRecordedProvenance(verified)
      const response = NextResponse.json({
        reply: renderPublicRecordedProvenance(recorded, languageFrom(body)),
        source: 'concierge-public-provenance-signed-capsule',
        external_ai_invoked: false,
        local_model_invoked: false,
        provenance_match_verified: true,
        execution_provenance: {
          authority: 'server_execution_telemetry',
          schema_version: 5,
          response_source: 'concierge-public-provenance-signed-capsule',
          lineage_completeness: 'deterministic_signed_capsule_read',
          local_reasoning: { invoked: false, model: null },
          external_ai: { invoked: false, provider: null, model: null },
          deterministic_utility: { used: true, utility: 'signed_answer_provenance_lookup' },
          semantic_cache: { used: false, evidence_count: 0 },
          live_external_evidence: { used: false, sources: [] },
          answer_origin: { from_cache: false, response_source: 'concierge-public-provenance-signed-capsule' },
          model_generated: false,
        },
      })
      return finalizeAnswer(response, req, body)
    }
  }

  const response = await cosBrowserPost(downstreamRequest(req, body))
  return finalizeAnswer(response, req, body)
}
