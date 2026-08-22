// saas/app/api/cos-primary/route.ts
// Browser/server COS ingress. Any request classified as fresh/volatile must use live evidence first.
// Local/pretrained model memory is never a permitted answer path for this class of request.
// Non-fresh requests retain the established COS Primary implementation in baseRoute.ts.

import { NextRequest, NextResponse } from 'next/server'
import { POST as basePost } from './baseRoute.ts'
import { requiresFreshExternalEvidence } from '@/lib/ai/cos/cosFreshnessPolicy'
import { resolveFreshConversationContext } from '@/lib/ai/cos/cosFreshConversationContext'
import { freshEvidenceMeetsQuestionAuthority } from '@/lib/ai/cos/cosFreshAuthority'
import {
  FRESH_SEARCH_RESULT_BUDGET,
  FRESH_SELECTED_EVIDENCE_BUDGET,
  attachFreshEvidenceProvenance,
  freshEvidenceSearchQuery,
  prepareFreshEvidence,
  type FreshEvidenceSource,
} from '@/lib/ai/cos/cosFreshGrounding'
import { synthesizeFreshEvidenceExternally } from '@/lib/ai/cos/freshEvidenceExternalSynthesis'
import { writeVolatileAnswerCache } from '@/lib/ai/cos/cosVolatileAnswerCache'
import { writeCosPrimaryProvenance } from '@/lib/ai/cos/cosPrimaryTurnProvenance'
import { buildCosLiveTelemetry, emitCosLiveTelemetry, type CosLiveResponseSource } from '@/lib/ai/cos/cosLiveTelemetry'
import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'
import { getAccess } from '@/lib/auth/access'
import {
  authoritativeProvenance,
  confidenceThreshold,
  externalFallbackEnabled,
  logEscalation,
} from '@/lib/ai/cos/cosOrchestration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== 'user') continue
    const content = messages[index]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.map((block: any) => String(block?.text || '')).join('\n').trim()
  }
  return ''
}

function languageFrom(body: any): string {
  const value = String(body?.context?.language || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(value) ? value : 'en'
}

function normalizeProvider(value: string | null): string | null {
  return value === 'claude' ? 'anthropic' : value
}

function freshEvidenceUnavailableReply(language: string): string {
  const messages: Record<string, string> = {
    en: 'COS requires live authoritative evidence for this current fact, but live verification is unavailable or insufficient right now. No model-memory answer was used.',
    es: 'COS requiere evidencia autorizada en vivo para este hecho actual, pero la verificación en vivo no está disponible o es insuficiente en este momento. No se utilizó una respuesta de memoria del modelo.',
    pt: 'O COS exige evidência autorizada ao vivo para este fato atual, mas a verificação ao vivo está indisponível ou insuficiente neste momento. Nenhuma resposta da memória do modelo foi usada.',
    pl: 'COS wymaga aktualnego, wiarygodnego źródła dla tego bieżącego faktu, ale w tej chwili weryfikacja na żywo jest niedostępna lub niewystarczająca. Nie użyto odpowiedzi z pamięci modelu.',
    ru: 'COS требует актуального авторитетного источника для этого текущего факта, но сейчас живая проверка недоступна или недостаточна. Ответ из памяти модели не использовался.',
  }
  return messages[language] || messages.en
}

function freshSynthesisRejectedReply(language: string): string {
  const messages: Record<string, string> = {
    en: 'COS retrieved live evidence, but the permitted evidence-grounded synthesis path could not produce a sufficiently grounded answer. The answer was rejected instead of guessing.',
    es: 'COS obtuvo evidencia en vivo, pero la ruta permitida de síntesis basada en evidencia no pudo producir una respuesta suficientemente fundamentada. La respuesta fue rechazada en lugar de adivinar.',
    pt: 'O COS obteve evidência ao vivo, mas a rota permitida de síntese baseada em evidências não conseguiu produzir uma resposta suficientemente fundamentada. A resposta foi rejeitada em vez de adivinhar.',
    pl: 'COS pobrał aktualne dowody, ale dozwolona ścieżka syntezy opartej na dowodach nie dała wystarczająco ugruntowanej odpowiedzi. Odpowiedź została odrzucona zamiast zgadywania.',
    ru: 'COS получил актуальные данные, но разрешённый путь синтеза на основе доказательств не дал достаточно обоснованного ответа. Ответ был отклонён вместо догадки.',
  }
  return messages[language] || messages.en
}

function emitFreshTelemetry(args: {
  startedAt: number
  input: string
  reply: string
  source: CosLiveResponseSource
  confidence: number
  externalAiInvoked: boolean
}) {
  const observation = buildCosLiveTelemetry({
    responseSource: args.source,
    latencyMs: Math.max(0, Date.now() - args.startedAt),
    confidence: args.confidence,
    reasonerLabel: null,
    localModelInvoked: false,
    externalAiInvoked: args.externalAiInvoked,
    knowledgeFactsUsed: 0,
    learnedItemsUsed: 0,
    userMemoriesUsed: 0,
    promptChars: args.input.length,
    replyChars: args.reply.length,
  })
  emitCosLiveTelemetry(observation)
  return observation
}

function freshExecutionProvenance(args: {
  sources: FreshEvidenceSource[]
  retrievedAt: string
  documentsAcquired: number
  contextUsed: boolean
  lookupDiffersFromOriginal: boolean
  error?: string | null
  synthesisAccepted?: boolean | null
  externalInvoked: boolean
  externalProvider?: string | null
  externalModel?: string | null
  externalNecessary: boolean
  reasonCode?: string | null
  reason?: string | null
  stoppingReason: string
}) {
  let provenance: any = authoritativeProvenance(null, {
    invoked: args.externalInvoked,
    provider: args.externalProvider ?? null,
    model: args.externalModel ?? null,
  })
  provenance = attachFreshEvidenceProvenance(provenance, {
    sources: args.sources,
    retrievedAt: args.retrievedAt,
    error: args.error ?? null,
    synthesisAccepted: args.synthesisAccepted ?? null,
  })
  provenance.autonomous_research = {
    ...(provenance.autonomous_research || {}),
    documents_acquired: args.documentsAcquired,
    new_knowledge_retained: 0,
  }
  provenance.external_ai = {
    ...(provenance.external_ai || {}),
    necessary: args.externalNecessary,
    escalation_reason_code: args.reasonCode ?? null,
    escalation_reason: args.reason ?? null,
  }
  provenance.local_reasoning = {
    ...(provenance.local_reasoning || {}),
    invoked: false,
    model: null,
    confidence: null,
    threshold: confidenceThreshold(),
  }
  provenance.fresh_local_synthesis = {
    attempted: false,
    accepted: null,
    policy: 'fresh_live_data_external_only',
  }
  provenance.freshness_context = {
    context_used: args.contextUsed,
    lookup_differs_from_original: args.lookupDiffersFromOriginal,
    assistant_text_used_for_resolution: false,
  }
  provenance.evidence_budget = {
    search_result_limit: FRESH_SEARCH_RESULT_BUDGET,
    results_received: args.documentsAcquired,
    evidence_selected: args.sources.length,
    stopping_reason: args.stoppingReason,
  }
  return provenance
}

async function handleFreshSinglePass(body: any, input: string, lookupInput: string, contextUsed: boolean) {
  const startedAt = Date.now()
  const language = languageFrom(body)
  const access = await getAccess().catch(() => null)
  const userId = access?.userId || null
  const retrievedAt = new Date().toISOString()
  const query = freshEvidenceSearchQuery(lookupInput, new Date(retrievedAt))
  const lookupDiffersFromOriginal = lookupInput !== input

  // Hard policy boundary: current/volatile questions start with a no-cache live retrieval.
  // No local model is consulted before, during, or after this retrieval path.
  const live = await getExternalInfo(query, FRESH_SEARCH_RESULT_BUDGET, { bypassCache: true })
  const documentsAcquired = live.ok ? live.results.length : 0
  const sources = live.ok ? prepareFreshEvidence(live.results, FRESH_SELECTED_EVIDENCE_BUDGET) : []
  const liveError = live.ok ? null : live.error || 'Live search returned no usable evidence.'
  const authoritySatisfied = freshEvidenceMeetsQuestionAuthority(lookupInput, sources)

  logEscalation({
    event: 'fresh_external_evidence_result',
    query,
    context_used: contextUsed,
    lookup_differs_from_original: lookupDiffersFromOriginal,
    documents_acquired: documentsAcquired,
    evidence_selected: sources.length,
    authority_satisfied: authoritySatisfied,
    error: liveError,
    source_urls: sources.map(source => source.url),
    local_model_invoked: false,
  })

  if (!authoritySatisfied) {
    const reason = liveError || 'Live current-fact verification did not produce enough independent authoritative evidence.'
    const executionProvenance = freshExecutionProvenance({
      sources,
      retrievedAt,
      documentsAcquired,
      contextUsed,
      lookupDiffersFromOriginal,
      error: reason,
      synthesisAccepted: false,
      externalInvoked: false,
      externalNecessary: false,
      reasonCode: 'insufficient_live_authority',
      reason,
      stoppingReason: 'insufficient_authoritative_evidence_no_model_synthesis',
    })
    const reply = freshEvidenceUnavailableReply(language)
    const liveTelemetry = emitFreshTelemetry({ startedAt, input: lookupInput, reply, source: 'failed_closed', confidence: 0, externalAiInvoked: false })
    await writeCosPrimaryProvenance(userId, reply, executionProvenance, 'cos-fresh-evidence-unavailable')
    return NextResponse.json({
      ok: false,
      reply,
      error: reply,
      source: 'cos-fresh-evidence-unavailable',
      confidence_score: 0,
      confidence_threshold: confidenceThreshold(),
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: false,
      execution_provenance: executionProvenance,
      freshness_context_used: contextUsed,
      live_evidence_retrieved_this_turn: documentsAcquired > 0,
      live_evidence_sources: sources.map(source => ({ id: source.id, title: source.title, url: source.url })),
      live_telemetry: liveTelemetry,
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }

  const escalationReasonCode = 'fresh_live_data_grounded_external_policy'
  const escalationReason = 'The request depends on current world state or a fresh named-entity reference lookup. COS retrieved authoritative live evidence and must synthesize only from that evidence; local/pretrained model memory is prohibited for this path.'

  if (!externalFallbackEnabled()) {
    const executionProvenance = freshExecutionProvenance({
      sources,
      retrievedAt,
      documentsAcquired,
      contextUsed,
      lookupDiffersFromOriginal,
      error: 'External evidence-grounded synthesis is disabled.',
      synthesisAccepted: false,
      externalInvoked: false,
      externalNecessary: true,
      reasonCode: escalationReasonCode,
      reason: escalationReason,
      stoppingReason: 'fresh_external_synthesis_required_but_disabled',
    })
    const reply = freshSynthesisRejectedReply(language)
    const liveTelemetry = emitFreshTelemetry({ startedAt, input: lookupInput, reply, source: 'failed_closed', confidence: 0, externalAiInvoked: false })
    await writeCosPrimaryProvenance(userId, reply, executionProvenance, 'cos-fresh-evidence-synthesis-rejected')
    return NextResponse.json({
      ok: false,
      reply,
      error: reply,
      source: 'cos-fresh-evidence-synthesis-rejected',
      confidence_score: 0,
      confidence_threshold: confidenceThreshold(),
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: false,
      execution_provenance: executionProvenance,
      freshness_context_used: contextUsed,
      live_telemetry: liveTelemetry,
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }

  // The external synthesizer receives only the contextualized question plus the live evidence block.
  // The evidence contract treats model memory as stale and rejects unsupported output.
  const externalFresh = await synthesizeFreshEvidenceExternally({ input: lookupInput, sources, retrievedAt, language })
  const externalInvoked = externalFresh.source === 'provider' || (externalFresh.source === null && externalFresh.attempted)
  const externalProvider = normalizeProvider(externalFresh.provider)
  const externalAccepted = externalFresh.accepted && Boolean(externalFresh.reply)
  const executionProvenance = freshExecutionProvenance({
    sources,
    retrievedAt,
    documentsAcquired,
    contextUsed,
    lookupDiffersFromOriginal,
    error: externalAccepted ? null : 'External fresh-evidence synthesis was unavailable or rejected by the evidence contract.',
    synthesisAccepted: externalAccepted,
    externalInvoked,
    externalProvider,
    externalModel: externalFresh.model,
    externalNecessary: true,
    reasonCode: escalationReasonCode,
    reason: escalationReason,
    stoppingReason: externalAccepted ? 'fresh_live_data_external_synthesis_accepted' : 'fresh_live_data_external_synthesis_rejected',
  })

  logEscalation({
    event: 'fresh_external_synthesis_result',
    provider: externalProvider,
    model: externalFresh.model,
    provider_source: externalFresh.source,
    external_ai_invoked: externalInvoked,
    local_model_invoked: false,
    context_used: contextUsed,
    documents_acquired: documentsAcquired,
    evidence_selected: sources.length,
    fresh_synthesis_accepted: externalAccepted,
  })

  if (!externalAccepted || !externalFresh.reply) {
    const reply = freshSynthesisRejectedReply(language)
    const liveTelemetry = emitFreshTelemetry({ startedAt, input: lookupInput, reply, source: 'failed_closed', confidence: 0, externalAiInvoked: externalInvoked })
    await writeCosPrimaryProvenance(userId, reply, executionProvenance, 'cos-fresh-evidence-synthesis-rejected')
    return NextResponse.json({
      ok: false,
      reply,
      error: reply,
      source: 'cos-fresh-evidence-synthesis-rejected',
      confidence_score: 0,
      confidence_threshold: confidenceThreshold(),
      external_ai_invoked: externalInvoked,
      external_provider: externalProvider,
      external_model: externalFresh.model,
      external_provider_source: externalFresh.source,
      external_fallback_invoked: externalInvoked,
      external_fallback_succeeded: false,
      local_model_invoked: false,
      execution_provenance: executionProvenance,
      freshness_context_used: contextUsed,
      live_telemetry: liveTelemetry,
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }

  const reply = externalFresh.reply
  executionProvenance.answer_origin = {
    ...(executionProvenance.answer_origin || {}),
    from_cache: false,
    provider: externalProvider,
    model: externalFresh.model,
    grounded_at: retrievedAt,
  }
  // Cache keys must include resolved user context. "When did she die?" cannot share an entry across
  // two different people merely because the surface follow-up text is identical.
  const volatileCacheWritten = await writeVolatileAnswerCache({
    prompt: lookupInput,
    language,
    value: { reply, groundedAt: retrievedAt, liveSources: sources, externalProvider, externalModel: externalFresh.model },
  })
  const liveTelemetry = emitFreshTelemetry({ startedAt, input: lookupInput, reply, source: 'external_fallback', confidence: 1, externalAiInvoked: externalInvoked })
  await writeCosPrimaryProvenance(userId, reply, executionProvenance, 'external_fresh_grounded')
  return NextResponse.json({
    ok: true,
    reply,
    source: 'external_fresh_grounded',
    confidence_score: 1,
    confidence_threshold: confidenceThreshold(),
    execution_provenance: executionProvenance,
    external_ai_invoked: externalInvoked,
    external_provider: externalProvider,
    external_model: externalFresh.model,
    external_provider_source: externalFresh.source,
    external_fallback_invoked: externalInvoked,
    external_fallback_succeeded: true,
    local_model_invoked: false,
    volatile_cache_written: volatileCacheWritten,
    freshness_context_used: contextUsed,
    live_evidence_retrieved_this_turn: true,
    live_evidence_sources: sources.map(source => ({ id: source.id, title: source.title, url: source.url })),
    live_telemetry: liveTelemetry,
    execution_allowed: false,
    external_action_taken: false,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const input = latestUserText(body)
  if (!input) return basePost(new NextRequest(req.clone()))

  const resolved = resolveFreshConversationContext(body, input)
  const freshRequired = requiresFreshExternalEvidence(input) || requiresFreshExternalEvidence(resolved.lookupInput)
  if (!freshRequired) return basePost(new NextRequest(req.clone()))
  return handleFreshSinglePass(body, resolved.originalInput, resolved.lookupInput, resolved.contextUsed)
}
