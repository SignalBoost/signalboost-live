// saas/app/api/support/route.ts
// Durable multi-turn provenance wrapper for the production support route.
import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { tryDeterministicUtility } from '@/lib/ai/cos/deterministicUtilities'
import { authoritativeProvenance, formatAuthoritativeProvenance, isProvenanceIntrospection, requestsExternalAction } from '@/lib/ai/cos/cosOrchestration'
import { isDirectStrategyGenerationRequest, renderDirectStrategyGeneration } from '@/lib/ai/cos/strategyProfileDirectGeneration'
import { readStrategyProfile } from '@/lib/ai/cos/strategyProfileReport'
import { persistTurn } from '@/lib/ai/tools/conversationHistory'
import {
  attachRecordedTurnProvenance,
  latestRecordedTurnProvenance,
  recordedTurnProvenanceByContent,
  recordLatestUserTurnProvenance,
  latestUserTurnProvenance,
  type RecordedTurnProvenance,
} from '@/lib/ai/cos/supportTurnProvenance'
import { evaluateRunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'
import { withRunpodWakePermission } from '@/lib/ai/local-inference'
import { renderPublicRecordedProvenance } from '@/lib/ai/cos/publicRecordedProvenance'
import { POST as legacyPOST } from './routeCoreLegacy.ts'

export { guardConfabulatedAction } from './routeCoreLegacy.ts'
export const maxDuration = 300

type SupportMessage = { role?: 'user' | 'assistant' | 'system'; content?: string }

function conversationIdFrom(body: any): string | null {
  const value = String(body?.context?.conversationId || '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null
}

function conversationIdForPersist(body: any): string {
  return conversationIdFrom(body) || randomUUID()
}

function latestUserMessage(body: any): string {
  const messages = (Array.isArray(body?.messages) ? body.messages : []) as SupportMessage[]
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role === 'user' && typeof message.content === 'string' && message.content.trim()) return message.content.trim()
  }
  return ''
}

function previousAssistantMessage(body: any): string {
  const messages = (Array.isArray(body?.messages) ? body.messages : []) as SupportMessage[]
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role === 'assistant' && typeof message.content === 'string' && message.content.trim()) return message.content.trim()
  }
  return ''
}

function languageCodeFrom(body: any): string {
  const value = String(body?.context?.language || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(value) ? value : 'en'
}

function noPriorProvenanceReply(languageCode: string): string {
  if (languageCode === 'es') return 'No tengo un registro de procedencia real para la respuesta inmediatamente anterior de esta conversación. No voy a reconstruirlo ni inventarlo después de los hechos.'
  if (languageCode === 'pt') return 'Não tenho um registro de proveniência real para a resposta imediatamente anterior desta conversa. Não vou reconstruí-lo nem inventá-lo depois do fato.'
  if (languageCode === 'pl') return 'Nie mam prawdziwego zapisu proweniencji bezpośrednio poprzedniej odpowiedzi w tej rozmowie. Nie będę go odtwarzać ani wymyślać po fakcie.'
  if (languageCode === 'ru') return 'У меня нет реальной записи происхождения непосредственно предыдущего ответа в этой беседе. Я не буду восстанавливать или придумывать её постфактум.'
  return "I don't have a real provenance record for the immediately preceding answer in this conversation. I won't reconstruct or fabricate it after the fact."
}

// Used only when the exact preceding turn could not be identified — neither the conversation ID
// nor the preceding-answer text was available to verify against, so the record below is the most
// recent one on file for this account, not a confirmed match to the specific answer just given.
function unverifiedProvenanceCaveat(languageCode: string): string {
  if (languageCode === 'es') return '⚠️ No pude confirmar que este registro corresponda exactamente a la respuesta anterior (no hubo una coincidencia precisa de conversación o contenido de respuesta para verificarlo) — muestro el registro de procedencia más reciente de esta cuenta. Si algo no coincide, esa es la razón.'
  if (languageCode === 'pt') return '⚠️ Não consegui confirmar que este registro corresponde exatamente à resposta anterior (não houve correspondência precisa de conversa ou conteúdo da resposta para verificar) — mostrando o registro de proveniência mais recente desta conta. Se algo não bater, essa é a razão.'
  if (languageCode === 'pl') return '⚠️ Nie udało się potwierdzić, że ten zapis dokładnie odpowiada poprzedniej odpowiedzi (nie było precyzyjnego dopasowania rozmowy ani treści odpowiedzi do weryfikacji) — pokazuję najnowszy zapis proweniencji dla tego konta. Jeśli coś się nie zgadza, to właśnie dlatego.'
  if (languageCode === 'ru') return '⚠️ Не удалось подтвердить, что эта запись точно соответствует предыдущему ответу (не было точного совпадения беседы или содержимого ответа для проверки) — показана самая последняя запись происхождения для этого аккаунта. Если что-то не сходится, вот причина.'
  return "⚠️ I could not confirm this record matches the immediately preceding answer exactly — a precise conversation or answer-content match was not available to verify against, so this is the most recent provenance record on file for this account, not a confirmed match to the specific answer just given. If something looks off, that mismatch is why."
}

function deterministicProvenance(body: any, prompt: string): RecordedTurnProvenance | null {
  const languageCode = languageCodeFrom(body)
  const result = tryDeterministicUtility({
    prompt,
    timezone: body?.context?.timezone || body?.context?.timeZone,
    locale: languageCode === 'pt' ? 'pt-BR' : languageCode === 'es' ? 'es' : languageCode === 'pl' ? 'pl' : languageCode === 'ru' ? 'ru' : 'en-US',
    confidenceThreshold: Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72'),
  })
  return result?.executionProvenance ?? null
}

function provenanceFromResponse(body: any, prompt: string, payload: any, isPrivileged: boolean): RecordedTurnProvenance | null {
  if (payload?.execution_provenance && typeof payload.execution_provenance === 'object' && !Array.isArray(payload.execution_provenance)) {
    return payload.execution_provenance as RecordedTurnProvenance
  }
  const source = String(payload?.source || '')
  if (source.startsWith('deterministic-current-')) return deterministicProvenance(body, prompt)
  if (source === 'anthropic-chief' || source === 'anthropic-concierge') {
    const provenance = authoritativeProvenance(null, {
      invoked: true,
      provider: 'anthropic',
      model: isPrivileged ? 'claude-sonnet-4-6' : 'claude-haiku-4-5',
    }) as any
    const explicitAction = requestsExternalAction(prompt)
    provenance.external_ai = {
      ...(provenance.external_ai || {}),
      necessary: explicitAction,
      escalation_reason_code: explicitAction ? 'explicit_external_action' : 'legacy_route_missing_escalation_trace',
      escalation_reason: explicitAction
        ? 'The user explicitly requested an external action that requires the governed executor.'
        : 'The legacy provider route did not embed its COS escalation decision in the response; this invocation is recorded as not justified until that trace is present.',
    }
    return provenance as RecordedTurnProvenance
  }
  if (source === 'deterministic-concierge') return authoritativeProvenance(null, { invoked: false }) as RecordedTurnProvenance
  return null
}

async function persistResponseTurn(params: {
  conversationId: string
  userId: string
  userMessage: string
  assistantReply: string
  provenance: RecordedTurnProvenance | null
  source: string
}) {
  const { conversationId, userId, userMessage, assistantReply, provenance, source } = params
  if (source === 'anthropic-chief' || source === 'anthropic-concierge') {
    const attached = await attachRecordedTurnProvenance(conversationId, userId, assistantReply, provenance)
    if (attached) return
  }
  await persistTurn({ conversationId, userId, userMessage, assistantReply, provenance: provenance ?? undefined })
}

async function directStrategyProfileResponse(body: any, prompt: string, isPrivileged: boolean): Promise<NextResponse | null> {
  if (!isDirectStrategyGenerationRequest(prompt)) return null

  const result = await readStrategyProfile({
    privileged: isPrivileged,
    organizationId: body?.context?.organizationId,
    workspace: body?.context?.workspace,
  })

  if ('error' in result) {
    return NextResponse.json({
      ok: false,
      reply: `COS could not read the current strategy profile: ${result.error}`,
      error: result.error,
      source: 'cos-strategy-profile-unavailable',
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: false,
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }

  const reply = renderDirectStrategyGeneration(prompt, result.profile)
  const provenance = authoritativeProvenance(null, { invoked: false }) as any
  const baselineCount = result.profile.generationDefaults?.status === 'available' ? 1 : 0
  const learnedCampaignIds = new Set(
    result.profile.dimensions
      .filter(dimension => dimension.status === 'learned')
      .flatMap(dimension => dimension.variants.flatMap(variant => variant.campaignIds)),
  )
  const retrievedCount = result.profile.totalCampaigns + baselineCount
  const evidenceCount = baselineCount + learnedCampaignIds.size

  provenance.semantic_cache = { used: false, evidence_count: 0 }
  provenance.enterprise_memory = {
    used: true,
    retrieved_count: retrievedCount,
    relevant_count: retrievedCount,
    selected_count: retrievedCount,
    injected_count: retrievedCount,
    evidence_count: Math.max(1, evidenceCount),
    status: 'connected_scope',
    organization_id: result.organizationId,
  }
  provenance.deterministic_utility = {
    used: true,
    utility: 'strategy_profile_generation',
  }
  provenance.strategy_profile = {
    generated_at: result.profile.generatedAt,
    measured_campaigns: result.profile.measuredCampaigns,
    learned_dimensions: result.profile.dimensions.filter(dimension => dimension.status === 'learned').map(dimension => dimension.dimension),
    baseline_source: result.profile.generationDefaults?.status === 'available' ? result.profile.generationDefaults.source : null,
  }
  provenance.answer_origin = {
    ...(provenance.answer_origin || {}),
    from_cache: false,
    stored_at: null,
    policy_version: null,
  }

  return NextResponse.json({
    ok: true,
    reply,
    source: 'cos-strategy-profile-direct',
    confidence_score: 1,
    external_ai_invoked: false,
    external_fallback_invoked: false,
    local_model_invoked: false,
    strategy_profile_direct: true,
    execution_provenance: provenance,
    execution_allowed: false,
    external_action_taken: false,
  })
}

export async function POST(req: NextRequest) {
  let body: any = null
  try {
    body = await req.clone().json()
  } catch {
    return legacyPOST(req)
  }

  const prompt = latestUserMessage(body)
  const precedingAssistant = previousAssistantMessage(body)
  const conversationId = conversationIdFrom(body)
  const languageCode = languageCodeFrom(body)
  let userId: string | null = null
  let isPrivileged = false
  try {
    const access = await getAccess()
    userId = access.userId
    isPrivileged = Boolean(access.isAdmin || access.isOwner)
  } catch {}

  if (prompt && isProvenanceIntrospection(prompt)) {
    if (!isPrivileged) {
      // Public provenance is a deterministic view of recorded turn history. Never ask a model to
      // describe its own prior execution: doing so can turn real live citations into fabricated
      // claims about "training", "memory", or "illustrative" sources.
      let publicRecord: any = null
      try {
        if (userId && precedingAssistant) publicRecord = await recordedTurnProvenanceByContent(userId, precedingAssistant)
        if (!publicRecord && userId && conversationId) publicRecord = await latestRecordedTurnProvenance(conversationId, userId)
      } catch {}
      const provenance = publicRecord?.provenance ?? publicRecord ?? null
      const reply = renderPublicRecordedProvenance(provenance, languageCode)
      return NextResponse.json({
        reply,
        source: provenance ? 'support-public-provenance-recorded' : 'support-public-provenance-unavailable',
        external_ai_invoked: false,
        local_model_invoked: false,
        provenance_match_verified: Boolean(provenance),
      })
    }
    if (!userId) {
      return NextResponse.json({
        reply: noPriorProvenanceReply(languageCode),
        source: 'cos-no-provenance-record',
        external_ai_invoked: false,
      })
    }
    // FOUR fallback levels, in decreasing order of certainty. The first two are verified against
    // either the exact conversation or the exact preceding-answer text, so a match there is
    // trustworthy. The LAST level is not: cos_latest_turn_provenance is one row per user,
    // overwritten by every successful turn, and this call omits the content check entirely (no
    // precedingAssistant text was available to check against) — so it returns WHATEVER was most
    // recently written for this user, with no verification it is the turn the person is actually
    // asking about. During rapid back-to-back testing this can and did surface a genuinely
    // different turn's confidence/telemetry while the reply claimed unconditional certainty
    // ("real, recorded provenance... not a model-generated reconstruction") — confirmed 2026-08-23
    // by comparing the introspection answer against the actual stored row for the same content,
    // which held a materially different confidence score.
    let verified = true
    let recorded = conversationId ? await latestRecordedTurnProvenance(conversationId, userId) : null
    if (!recorded && precedingAssistant) recorded = await recordedTurnProvenanceByContent(userId, precedingAssistant)
    if (!recorded && precedingAssistant) recorded = await latestUserTurnProvenance(userId, precedingAssistant)
    // LAST RESORT, NOW REACHABLE: a failed precise match may still return the latest record, explicitly unverified.
    if (!recorded) {
      recorded = await latestUserTurnProvenance(userId)
      verified = false
    }
    if (!recorded) {
      return NextResponse.json({
        reply: noPriorProvenanceReply(languageCode),
        source: 'cos-no-provenance-record',
        external_ai_invoked: false,
      })
    }
    const formatted = formatAuthoritativeProvenance(recorded as any, languageCode)
    const reply = verified ? formatted : [unverifiedProvenanceCaveat(languageCode), '', formatted].join('\n')
    return NextResponse.json({
      reply,
      source: 'cos-authoritative-provenance',
      execution_provenance: recorded,
      external_ai_invoked: false,
      provenance_match_verified: verified,
    })
  }

  let response: Response
  const directStrategy = prompt ? await directStrategyProfileResponse(body, prompt, isPrivileged) : null
  if (directStrategy) {
    response = directStrategy
  } else {
    const wakePermission = evaluateRunpodWakePermission({
      body,
      interactionHeader: req.headers.get('x-signalboost-user-interaction'),
      requestOrigin: req.headers.get('origin'),
      expectedOrigin: req.nextUrl.origin,
      secFetchSite: req.headers.get('sec-fetch-site'),
    })
    console.info('[cos-runpod-wake-permission]', JSON.stringify({
      at: new Date().toISOString(),
      allowed: wakePermission.allowed,
      source: wakePermission.source,
      interactionId: wakePermission.interactionId,
      ageMs: wakePermission.ageMs,
      reason: wakePermission.reason,
    }))

    response = await withRunpodWakePermission(wakePermission, () => legacyPOST(req))
  }

  if (!response.ok || !prompt || !userId) return response

  try {
    const payload = await response.clone().json()
    const reply = typeof payload?.reply === 'string' ? payload.reply.trim() : ''
    if (!reply) return response
    const source = String(payload?.source || '')
    const provenance = provenanceFromResponse(body, prompt, payload, isPrivileged)
    if (provenance) {
      await recordLatestUserTurnProvenance(userId, reply, provenance, source)
    }
    await persistResponseTurn({
      conversationId: conversationIdForPersist(body),
      userId,
      userMessage: prompt,
      assistantReply: reply,
      provenance,
      source,
    })
  } catch (error) {
    console.error('support provenance persistence failed (non-blocking)', error)
  }
  return response
}
