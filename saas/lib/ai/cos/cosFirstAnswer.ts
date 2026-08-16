// Compatibility entrypoint. Ordinary COS reasoning remains in cosFirstAnswerEnterprise.
// Volatile/current facts are intercepted here and MUST be re-verified live on every request before
// any model is allowed to answer. No answer cache, Knowledge Graph, learned corpus, Enterprise
// Memory, user memory, or pretrained/model memory is authoritative for this path.

import { callCosReasoner, resolveCosReasoner } from './cosReasoner'
import { requiresFreshExternalEvidence } from './cosFreshnessPolicy'
import {
  FRESH_SEARCH_RESULT_BUDGET,
  FRESH_SELECTED_EVIDENCE_BUDGET,
  freshEvidenceGroundingBlock,
  freshEvidenceMeetsAuthority,
  freshEvidenceSearchQuery,
  prepareFreshEvidence,
  replyCitesIndependentFreshEvidence,
  resolveDeterministicFreshOfficeHolder,
  type FreshEvidenceSource,
} from './cosFreshGrounding'
import { parseLocalResult } from './reasonerOutput'
import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'
import { ensureLocalInferenceRuntimeReady } from '@/lib/ai/local-inference'
import {
  tryCOSFirstAnswer as tryEnterpriseCOSFirstAnswer,
  type COSFirstAnswerResult,
} from './cosFirstAnswerEnterprise'

export * from './cosFirstAnswerEnterprise'

function confidenceThreshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function emptyStage() {
  return { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 }
}

function freshVerificationUnavailable(language = 'en'): string {
  if (language === 'es') return 'No pude verificar este dato actual con suficientes fuentes independientes y autorizadas. No voy a adivinar ni usar un modelo externo para sustituir evidencia que falta.'
  if (language === 'pt') return 'Não consegui verificar este fato atual com fontes independentes e autorizadas suficientes. Não vou adivinhar nem usar um modelo externo para substituir evidência ausente.'
  if (language === 'pl') return 'Nie udało mi się zweryfikować tego aktualnego faktu w wystarczającej liczbie niezależnych i autorytatywnych źródeł. Nie będę zgadywać ani używać zewnętrznego modelu zamiast brakujących dowodów.'
  if (language === 'ru') return 'Мне не удалось подтвердить этот текущий факт достаточным числом независимых авторитетных источников. Я не буду угадывать или использовать внешнюю модель вместо отсутствующих доказательств.'
  return 'I could not verify this current fact from enough independent authoritative live sources. I will not guess or use an external model as a substitute for missing evidence.'
}

function freshProvenance(args: {
  reasonerLabel: string | null
  localModelInvoked: boolean
  retrievedAt: string
  sources: FreshEvidenceSource[]
  documentsAcquired?: number
  responseSource?: string
  deterministicResolverUsed?: boolean
  externalAiNecessary?: boolean
  escalationReasonCode?: string | null
  escalationReason?: string | null
  evidenceBudget?: Record<string, unknown>
}) {
  return {
    responseSource: args.responseSource ?? (args.localModelInvoked ? 'local_cos_reasoning' : 'external_fallback_required'),
    externalAiInvoked: false as const,
    externalAiNecessary: args.externalAiNecessary === true,
    escalationReasonCode: args.escalationReasonCode ?? null,
    escalationReason: args.escalationReason ?? null,
    deterministicFreshFactUsed: args.deterministicResolverUsed === true,
    evidenceBudget: args.evidenceBudget ?? null,
    localModelInvoked: args.localModelInvoked,
    reasonerLabel: args.reasonerLabel,
    internalSystemsConsulted: ['Freshness Policy', 'Live Web Search', ...(args.deterministicResolverUsed ? ['Deterministic Authoritative Resolver'] : []), ...(args.localModelInvoked ? ['Independent Local Reasoner'] : [])],
    knowledgeFactsUsed: 0,
    learnedItemsUsed: 0,
    enterpriseMemoriesUsed: 0,
    userMemoriesUsed: 0,
    cognitiveSkillsUsed: 0,
    enterpriseMemoryStatus: 'not_consulted_live_current_fact',
    enterpriseMemoryOrganizationId: null,
    evidenceFunnel: {
      knowledgeGraph: emptyStage(),
      learnedCorpus: emptyStage(),
      enterpriseMemory: emptyStage(),
      userMemory: emptyStage(),
    },
    cognitiveSkillFunnel: emptyStage(),
    knowledgeFactsCited: 0,
    learnedItemsCited: 0,
    enterpriseMemoriesCited: 0,
    userMemoriesCited: 0,
    cognitiveSkillsCited: 0,
    autonomousResearchAttempted: true,
    researchDocumentsAcquired: args.documentsAcquired ?? args.sources.length,
    knowledgeNewlyRetained: 0,
    liveExternalEvidence: {
      retrievedAt: args.retrievedAt,
      sources: args.sources.map(source => ({ id: source.id, title: source.title, url: source.url })),
    },
  }
}

async function tryFreshCurrentFact(input: {
  prompt: string
  userId?: string | null
  language?: string
  privileged?: boolean
}): Promise<COSFirstAnswerResult> {
  const retrievedAt = new Date().toISOString()
  const query = freshEvidenceSearchQuery(input.prompt, new Date(retrievedAt))

  // bypassCache=true is load-bearing: a volatile fact is searched again on every user request.
  // The result count is deliberately bounded. COS does not keep collecting low-value documents
  // after enough authoritative evidence exists for deterministic or local synthesis.
  const live = await getExternalInfo(query, FRESH_SEARCH_RESULT_BUDGET, { bypassCache: true })
  const documentsAcquired = live.ok ? live.results.length : 0
  const sources = live.ok ? prepareFreshEvidence(live.results, FRESH_SELECTED_EVIDENCE_BUDGET) : []
  const baseBudget = {
    search_result_limit: FRESH_SEARCH_RESULT_BUDGET,
    results_received: documentsAcquired,
    evidence_selected: sources.length,
  }

  if (!live.ok || !freshEvidenceMeetsAuthority(input.prompt, sources)) {
    const reason = live.error
      ? `Live current-fact verification failed: ${live.error}`
      : 'Live current-fact verification did not produce enough independent authoritative evidence.'
    return {
      handled: true,
      reply: freshVerificationUnavailable(input.language),
      confidence: 0,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources,
        documentsAcquired,
        responseSource: 'live_verification_refusal',
        externalAiNecessary: false,
        escalationReasonCode: 'insufficient_live_authority',
        escalationReason: reason,
        evidenceBudget: { ...baseBudget, stopping_reason: 'insufficient_authoritative_evidence_no_cloud_escalation' },
      }) as any,
    }
  }

  const deterministic = resolveDeterministicFreshOfficeHolder(input.prompt, sources)
  if (deterministic) {
    return {
      handled: true,
      reply: deterministic.reply,
      confidence: deterministic.confidence,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources: deterministic.sources,
        documentsAcquired,
        responseSource: 'deterministic_authoritative_fact',
        deterministicResolverUsed: true,
        externalAiNecessary: false,
        escalationReasonCode: null,
        escalationReason: null,
        evidenceBudget: {
          ...baseBudget,
          evidence_selected: deterministic.sources.length,
          stopping_reason: 'authoritative_cross_source_consensus',
        },
      }) as any,
    }
  }

  const resolved = resolveCosReasoner()
  if (!resolved.config) {
    const reason = 'Live evidence was retrieved, but the independent local reasoner is not configured for grounded synthesis.'
    return {
      handled: false,
      confidence: 0,
      reason,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources,
        documentsAcquired,
        externalAiNecessary: true,
        escalationReasonCode: 'local_reasoner_not_configured',
        escalationReason: reason,
        evidenceBudget: { ...baseBudget, stopping_reason: 'authoritative_evidence_ready_local_reasoner_unavailable' },
      }) as any,
    }
  }

  const evidenceBlock = freshEvidenceGroundingBlock(input.prompt, sources, retrievedAt)
  const reasoned = await callCosReasoner({
    temperature: 0,
    maxTokens: 1800,
    // Deliberately does not contain the PRIMARY-reasoner marker, so simple current facts never fan
    // out into the Cognitive Council.
    systemPrompt: [
      'You are SignalBoost COS live-fact verifier.',
      'Return ONLY strict JSON: {"answer":"...","confidence":0.0}.',
      'For any present/current claim, use only the server-retrieved LIVE evidence in the prompt.',
      'Never use pretrained memory, previous conversation facts, caches, or durable COS memory to fill a gap.',
      'If independent sources disagree, or the evidence cannot establish the answer, say live verification is insufficient and use confidence <= 0.30.',
      'When corroboration is required, cite at least two independent [LIVE#] labels AND include both exact source URLs in the answer.',
    ].join(' '),
    prompt: `${evidenceBlock}\n\nAnswer the original question now.`,
  }).catch(() => null)

  const provenance = freshProvenance({
    reasonerLabel: reasoned?.reasoner.label ?? resolved.config.label,
    localModelInvoked: true,
    retrievedAt,
    sources,
    documentsAcquired,
    evidenceBudget: { ...baseBudget, stopping_reason: 'bounded_evidence_sent_to_local_reasoner' },
  })

  if (!reasoned?.text) {
    const reason = 'Live evidence was retrieved, but independent local synthesis returned no answer.'
    return {
      handled: false,
      confidence: 0,
      reason,
      provenance: { ...provenance, externalAiNecessary: true, escalationReasonCode: 'local_synthesis_failed', escalationReason: reason } as any,
    }
  }

  const parsed = parseLocalResult(reasoned.text)
  if (!parsed || parsed.truncated) {
    const reason = 'Live evidence was retrieved, but independent local synthesis was incomplete or unparseable.'
    return {
      handled: false,
      confidence: 0,
      reason,
      provenance: { ...provenance, externalAiNecessary: true, escalationReasonCode: 'local_synthesis_unparseable', escalationReason: reason } as any,
    }
  }

  const citesIndependentEvidence = replyCitesIndependentFreshEvidence(parsed.answer, input.prompt, sources)
  const confidence = Math.max(0, Math.min(1, parsed.confidence))
  if (!citesIndependentEvidence || confidence < confidenceThreshold()) {
    const reason = !citesIndependentEvidence
      ? 'Current-fact synthesis was rejected because it did not cite the required independent live sources.'
      : `Current-fact synthesis confidence ${confidence.toFixed(2)} is below threshold ${confidenceThreshold().toFixed(2)}.`
    return {
      handled: false,
      confidence,
      reason,
      bestEffortReply: parsed.answer,
      provenance: {
        ...provenance,
        externalAiNecessary: true,
        escalationReasonCode: !citesIndependentEvidence ? 'citation_grounding_rejected' : 'local_synthesis_below_threshold',
        escalationReason: reason,
      } as any,
    }
  }

  return {
    handled: true,
    reply: parsed.answer,
    confidence,
    provenance: { ...provenance, externalAiNecessary: false, escalationReasonCode: null, escalationReason: null } as any,
  }
}

export async function tryCOSFirstAnswer(input: {
  prompt: string
  userId?: string | null
  language?: string
  privileged?: boolean
}): Promise<COSFirstAnswerResult> {
  if (requiresFreshExternalEvidence(input.prompt)) {
    return tryFreshCurrentFact(input)
  }

  // Ordinary enterprise retrieval has bounded semantic-query budgets. Complete any authorized
  // RunPod cold-start lifecycle before those timers begin so no abandoned retrieval promise can
  // keep paid compute waking after lexical fallback already returned. Under #1224, background and
  // server-to-server callers fail closed here; lexical/external fallback remains available.
  if (process.env.COS_LOCAL_FIRST_ENABLED !== 'false') {
    try {
      await ensureLocalInferenceRuntimeReady()
    } catch (error) {
      console.info('[cos-runtime-preflight-unavailable]', JSON.stringify({
        at: new Date().toISOString(),
        reason: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  return tryEnterpriseCOSFirstAnswer(input)
}
