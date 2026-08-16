// saas/app/api/cos-primary/route.ts
// Browser/server COS ingress. Fresh facts are intercepted here so each turn gets exactly one
// live search, one deterministic resolution attempt, and at most one local synthesis attempt.
// Non-fresh requests retain the established COS Primary implementation in baseRoute.ts.

import { NextRequest, NextResponse } from 'next/server'
import { POST as basePost } from './baseRoute.ts'
import { requiresFreshExternalEvidence } from '@/lib/ai/cos/cosFreshnessPolicy'
import {
  FRESH_SEARCH_RESULT_BUDGET,
  FRESH_SELECTED_EVIDENCE_BUDGET,
  attachFreshEvidenceProvenance,
  freshEvidenceMeetsAuthority,
  freshEvidenceSearchQuery,
  prepareFreshEvidence,
  resolveDeterministicFreshOfficeHolder,
  type FreshEvidenceSource,
} from '@/lib/ai/cos/cosFreshGrounding'
import { synthesizeFreshEvidenceLocally } from '@/lib/ai/cos/freshEvidenceLocalSynthesis'
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
  requestsExternalAction,
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

function localReasonerLabel(): string {
  return `independent-local:${(process.env.LOCAL_AI_MODEL || 'local-model').trim()}`
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
    en: 'COS retrieved live evidence, but no permitted synthesis path could produce a sufficiently grounded answer. The answer was rejected instead of guessing.',
    es: 'COS obtuvo evidencia en vivo, pero ninguna ruta de síntesis permitida pudo producir una respuesta suficientemente fundamentada. La respuesta fue rechazada en lugar de adivinar.',
    pt: 'O COS obteve evidência ao vivo, mas nenhuma rota de síntese permitida conseguiu produzir uma resposta suficientemente fundamentada. A resposta foi rejeitada em vez de adivinhar.',
    pl: 'COS pobrał aktualne dowody, ale żadna dozwolona ścieżka syntezy nie dała wystarczająco ugruntowanej odpowiedzi. Odpowiedź została odrzucona zamiast zgadywania.',
    ru: 'COS получил актуальные данные, но ни один разрешённый путь синтеза не дал достаточно обоснованного ответа. Ответ был отклонён вместо догадки.',
  }
  return messages[language] || messages.en
}

function emitFreshTelemetry(args: {
  startedAt: number
  input: string
  reply: string
  source: CosLiveResponseSource
  confidence: number
  localModelInvoked: boolean
  reasonerLabel?: string | null
  externalAiInvoked: boolean
}) {
  const observation = buildCosLiveTelemetry({
    responseSource: args.source,
    latencyMs: Math.max(0, Date.now() - args.startedAt),
    confidence: args.confidence,
    reasonerLabel: args.reasonerLabel ?? null,
    localModelInvoked: args.localModelInvoked,
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
  error?: string | null
  synthesisAccepted?: boolean | null
  localAttempted?: boolean
  localAccepted?: boolean | null
  localModel?: string | null
  externalInvoked: boolean
  externalProvider?: string | null
  externalModel?: string | null
  externalNecessary: boolean
  reasonCode?: string | null
  reason?: string | null
  stoppingReason: string
  deterministic?: boolean
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
  provenance.evidence_budget = {
    search_result_limit: FRESH_SEARCH_RESULT_BUDGET,
    results_received: args.documentsAcquired,
    evidence_selected: args.sources.length,
    stopping_reason: args.stoppingReason,
  }
  if (args.localAttempted) {
    provenance.local_reasoning = {
      ...(provenance.local_reasoning || {}),
      invoked: true,
      model: args.localModel || localReasonerLabel(),
      confidence: args.localAccepted === true ? 1 : null,
      threshold: confidenceThreshold(),
    }
    provenance.fresh_local_synthesis = { attempted: true, accepted: args.localAccepted ?? null }
  }
  if (args.deterministic) {
    provenance.deterministic_utility = { used: true, utility: 'authoritative_live_consensus' }
  }
  return provenance
}

async function handleFreshSinglePass(req: NextRequest, body: any, input: string) {
  const startedAt = Date.now()
  const language = languageFrom(body)
  const requestedAction = requestsExternalAction(input)
  const access = await getAccess().catch(() => null)
  const userId = access?.userId || null
  const retrievedAt = new Date().toISOString()
  const query = freshEvidenceSearchQuery(input, new Date(retrievedAt))
  const live = await getExternalInfo(query, FRESH_SEARCH_RESULT_BUDGET, { bypassCache: true })
  const documentsAcquired = live.ok ? live.results.length : 0
  const sources = live.ok ? prepareFreshEvidence(live.results, FRESH_SELECTED_EVIDENCE_BUDGET) : []
  const liveError = live.ok ? null : live.error || 'Live search returned no usable evidence.'
  const authoritySatisfied = freshEvidenceMeetsAuthority(input, sources)

  logEscalation({
    event: 'fresh_external_evidence_result',
    query,
    documents_acquired: documentsAcquired,
    evidence_selected: sources.length,
    authority_satisfied: authoritySatisfied,
    error: liveError,
    source_urls: sources.map(source => source.url),
  })

  if (!authoritySatisfied) {
    const reason = liveError || 'Live current-fact verification did not produce enough independent authoritative evidence.'
    const executionProvenance = freshExecutionProvenance({
      sources,
      retrievedAt,
      documentsAcquired,
      error: reason,
      synthesisAccepted: false,
      externalInvoked: false,
      externalNecessary: false,
      reasonCode: 'insufficient_live_authority',
      reason,
      stoppingReason: 'insufficient_authoritative_evidence_no_cloud_escalation',
    })
    const reply = freshEvidenceUnavailableReply(language)
    const liveTelemetry = emitFreshTelemetry({ startedAt, input, reply, source: 'failed_closed', confidence: 0, localModelInvoked: false, externalAiInvoked: false })
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
      live_evidence_retrieved_this_turn: documentsAcquired > 0,
      live_evidence_sources: sources.map(source => ({ id: source.id, title: source.title, url: source.url })),
      live_telemetry: liveTelemetry,
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }

  const deterministic = resolveDeterministicFreshOfficeHolder(input, sources)
  if (deterministic) {
    const materialSources = deterministic.sources
    const executionProvenance = freshExecutionProvenance({
      sources: materialSources,
      retrievedAt,
      documentsAcquired,
      synthesisAccepted: null,
      externalInvoked: false,
      externalNecessary: false,
      stoppingReason: 'authoritative_cross_source_consensus',
      deterministic: true,
    })
    executionProvenance.answer_origin = {
      ...(executionProvenance.answer_origin || {}),
      from_cache: false,
      provider: null,
      model: null,
      grounded_at: retrievedAt,
    }
    const reply = deterministic.reply
    const volatileCacheWritten = await writeVolatileAnswerCache({
      prompt: input,
      language,
      value: { reply, groundedAt: retrievedAt, liveSources: materialSources, externalProvider: null, externalModel: null },
    })
    const liveTelemetry = emitFreshTelemetry({ startedAt, input, reply, source: 'deterministic', confidence: deterministic.confidence, localModelInvoked: false, externalAiInvoked: false })
    logEscalation({ event: 'fresh_deterministic_consensus_accepted', documents_acquired: documentsAcquired, evidence_selected: materialSources.length, external_ai_invoked: false, local_model_invoked: false })
    await writeCosPrimaryProvenance(userId, reply, executionProvenance, 'deterministic-current-live')
    return NextResponse.json({
      ok: true,
      reply,
      source: 'deterministic-current-live',
      confidence_score: deterministic.confidence,
      confidence_threshold: confidenceThreshold(),
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: false,
      deterministic_fresh_fact_used: true,
      execution_provenance: executionProvenance,
      volatile_cache_written: volatileCacheWritten,
      live_evidence_retrieved_this_turn: true,
      live_evidence_sources: materialSources.map(source => ({ id: source.id, title: source.title, url: source.url })),
      live_telemetry: liveTelemetry,
      execution_allowed: false,
      external_action_taken: false,
    })
  }

  let localAttempted = false
  let localModel: string | null = null
  if (!requestedAction) {
    localAttempted = true
    localModel = localReasonerLabel()
    const localSynthesis = await synthesizeFreshEvidenceLocally({ input, sources, retrievedAt, language })
    if (localSynthesis) {
      localModel = localSynthesis.reasonerLabel
      const executionProvenance = freshExecutionProvenance({
        sources,
        retrievedAt,
        documentsAcquired,
        synthesisAccepted: true,
        localAttempted: true,
        localAccepted: true,
        localModel,
        externalInvoked: false,
        externalNecessary: false,
        stoppingReason: 'bounded_evidence_local_synthesis_accepted',
      })
      executionProvenance.answer_origin = {
        ...(executionProvenance.answer_origin || {}),
        from_cache: false,
        provider: null,
        model: localModel,
        grounded_at: retrievedAt,
      }
      const reply = localSynthesis.reply
      const volatileCacheWritten = await writeVolatileAnswerCache({
        prompt: input,
        language,
        value: { reply, groundedAt: retrievedAt, liveSources: sources, externalProvider: null, externalModel: null },
      })
      const liveTelemetry = emitFreshTelemetry({ startedAt, input, reply, source: 'local_cos_reasoning', confidence: 1, localModelInvoked: true, reasonerLabel: localModel, externalAiInvoked: false })
      logEscalation({ event: 'fresh_local_synthesis_accepted', documents_acquired: documentsAcquired, evidence_selected: sources.length, reasoner: localModel, external_ai_invoked: false, local_model_invoked: true })
      await writeCosPrimaryProvenance(userId, reply, executionProvenance, 'cos-fresh-local-grounded')
      return NextResponse.json({
        ok: true,
        reply,
        source: 'cos-fresh-local-grounded',
        confidence_score: 1,
        confidence_threshold: confidenceThreshold(),
        external_ai_invoked: false,
        external_fallback_invoked: false,
        local_model_invoked: true,
        execution_provenance: executionProvenance,
        volatile_cache_written: volatileCacheWritten,
        live_evidence_retrieved_this_turn: true,
        live_evidence_sources: sources.map(source => ({ id: source.id, title: source.title, url: source.url })),
        live_telemetry: liveTelemetry,
        execution_allowed: false,
        external_action_taken: false,
      })
    }
    logEscalation({ event: 'fresh_local_synthesis_declined', documents_acquired: documentsAcquired, evidence_selected: sources.length, external_ai_invoked: false, local_model_invoked: true })
  }

  const escalationReasonCode = requestedAction ? 'explicit_external_action' : 'local_synthesis_failed'
  const escalationReason = requestedAction
    ? 'The user requested an external action; current-fact evidence was gathered but no action is executed by this read-only synthesis path.'
    : 'Authoritative live evidence was available, but deterministic and local synthesis did not complete the answer.'

  if (!externalFallbackEnabled()) {
    const executionProvenance = freshExecutionProvenance({
      sources,
      retrievedAt,
      documentsAcquired,
      error: 'External synthesis is disabled.',
      synthesisAccepted: false,
      localAttempted,
      localAccepted: localAttempted ? false : null,
      localModel,
      externalInvoked: false,
      externalNecessary: true,
      reasonCode: escalationReasonCode,
      reason: escalationReason,
      stoppingReason: 'external_synthesis_required_but_disabled',
    })
    const reply = freshSynthesisRejectedReply(language)
    const liveTelemetry = emitFreshTelemetry({ startedAt, input, reply, source: 'failed_closed', confidence: 0, localModelInvoked: localAttempted, reasonerLabel: localModel, externalAiInvoked: false })
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
      local_model_invoked: localAttempted,
      execution_provenance: executionProvenance,
      live_telemetry: liveTelemetry,
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }

  const externalFresh = await synthesizeFreshEvidenceExternally({ input, sources, retrievedAt, language })
  const externalInvoked = externalFresh.source === 'provider' || (externalFresh.source === null && externalFresh.attempted)
  const externalProvider = normalizeProvider(externalFresh.provider)
  const externalAccepted = externalFresh.accepted && Boolean(externalFresh.reply)
  const executionProvenance = freshExecutionProvenance({
    sources,
    retrievedAt,
    documentsAcquired,
    error: externalAccepted ? null : 'External fresh-evidence synthesis was unavailable or rejected by the evidence contract.',
    synthesisAccepted: externalAccepted,
    localAttempted,
    localAccepted: localAttempted ? false : null,
    localModel,
    externalInvoked,
    externalProvider,
    externalModel: externalFresh.model,
    externalNecessary: true,
    reasonCode: escalationReasonCode,
    reason: escalationReason,
    stoppingReason: externalAccepted ? 'direct_external_grounded_synthesis_accepted' : 'direct_external_grounded_synthesis_rejected',
  })

  logEscalation({
    event: 'fresh_external_synthesis_result',
    provider: externalProvider,
    model: externalFresh.model,
    provider_source: externalFresh.source,
    external_ai_invoked: externalInvoked,
    local_model_invoked: localAttempted,
    documents_acquired: documentsAcquired,
    evidence_selected: sources.length,
    fresh_synthesis_accepted: externalAccepted,
  })

  if (!externalAccepted || !externalFresh.reply) {
    const reply = freshSynthesisRejectedReply(language)
    const liveTelemetry = emitFreshTelemetry({ startedAt, input, reply, source: 'failed_closed', confidence: 0, localModelInvoked: localAttempted, reasonerLabel: localModel, externalAiInvoked: externalInvoked })
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
      local_model_invoked: localAttempted,
      execution_provenance: executionProvenance,
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
  const volatileCacheWritten = await writeVolatileAnswerCache({
    prompt: input,
    language,
    value: { reply, groundedAt: retrievedAt, liveSources: sources, externalProvider, externalModel: externalFresh.model },
  })
  const liveTelemetry = emitFreshTelemetry({ startedAt, input, reply, source: 'external_fallback', confidence: 1, localModelInvoked: localAttempted, reasonerLabel: localModel, externalAiInvoked: externalInvoked })
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
    local_model_invoked: localAttempted,
    volatile_cache_written: volatileCacheWritten,
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
  if (!input || !requiresFreshExternalEvidence(input)) return basePost(new NextRequest(req.clone()))
  return handleFreshSinglePass(req, body, input)
}
