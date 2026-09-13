import { NextRequest, NextResponse } from 'next/server'
import { POST as cosBrowserPost } from '@/app/api/cos-browser/route'
import { getAccess } from '@/lib/auth/access'
import { isProvenanceIntrospection } from '@/lib/ai/cos/cosOrchestration'
import { ensureAnswerExecutionProvenance } from '@/lib/ai/cos/answerProvenance.ts'
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

async function finalizeAnswer(response: Response, req: NextRequest, body: any): Promise<Response> {
  let payload: any
  try { payload = await response.clone().json() } catch { return response }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return response
  const reply = typeof payload.reply === 'string' ? payload.reply.trim() : ''
  if (!reply) return response

  const provenance = ensureAnswerExecutionProvenance(payload)
  const scopedProvenance = {
    ...provenance,
    delivery_scope: publicSurface(req) ? 'public_concierge' : 'owner_assistant',
    audit_identity: publicSurface(req)
      ? { binding: 'server_authenticated_user_id_or_signed_capsule', authorization_authority: false, exposed_to_reasoning: false }
      : (provenance as any)?.audit_identity,
  }
  const answerProvenance = createPublicAnswerProvenanceCapsule(
    { ...payload, execution_provenance: scopedProvenance },
    reply,
  )

  // Durable account-bound record when a signed-in identity exists. Anonymous preview users still
  // receive the signed capsule, which is bound to the exact answer text and can be verified on the
  // immediately following provenance question without trusting model memory or client assertions.
  const access = await getAccess().catch(() => null)
  const userId = access?.userId || null
  if (userId) {
    await recordLatestUserTurnProvenance(
      userId,
      reply,
      scopedProvenance,
      String(payload.source || 'browser-delivery'),
    ).catch(() => false)
  }

  return withJsonPayload(response, {
    ...payload,
    execution_provenance: payload.execution_provenance ?? scopedProvenance,
    answer_provenance: answerProvenance,
  })
}

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.clone().json().catch(() => ({}))
  const prompt = latestUserText(body)
  const prior = precedingAssistant(body)

  // Public users may be in trial mode with no account row yet. Prefer a cryptographically verified
  // capsule carried with the exact preceding assistant message. It is accepted only when its HMAC
  // verifies AND its answer hash matches that exact displayed answer. A fabricated/replayed capsule
  // is ignored and the mature durable-record path gets the request instead.
  if (publicSurface(req) && prompt && isProvenanceIntrospection(prompt) && prior && typeof prior.content === 'string') {
    const suppliedCapsule = prior.answerProvenance ?? prior.answer_provenance
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

  const response = await cosBrowserPost(req)
  return finalizeAnswer(response, req, body)
}
