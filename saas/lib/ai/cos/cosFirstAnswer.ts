// Compatibility entrypoint. Ordinary COS reasoning remains in cosFirstAnswerEnterprise.
// Volatile/current facts are intercepted here and MUST be re-verified live on every request before
// any model is allowed to answer. No answer cache, Knowledge Graph, learned corpus, Enterprise
// Memory, user memory, or pretrained/model memory is authoritative for this path.

import { callCosReasoner, resolveCosReasoner } from './cosReasoner'
import { requiresFreshExternalEvidence } from './cosFreshnessPolicy'
import {
  freshEvidenceGroundingBlock,
  freshEvidenceMeetsAuthority,
  freshEvidenceSearchQuery,
  prepareFreshEvidence,
  replyCitesIndependentFreshEvidence,
  type FreshEvidenceSource,
} from './cosFreshGrounding'
import { parseLocalResult } from './reasonerOutput'
import { getExternalInfo } from '@/lib/ai/tools/getExternalInfo'
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

function freshProvenance(args: {
  reasonerLabel: string | null
  localModelInvoked: boolean
  retrievedAt: string
  sources: FreshEvidenceSource[]
}) {
  return {
    responseSource: args.localModelInvoked ? 'local_cos_reasoning' : 'external_fallback_required',
    externalAiInvoked: false as const,
    localModelInvoked: args.localModelInvoked,
    reasonerLabel: args.reasonerLabel,
    internalSystemsConsulted: ['Freshness Policy', 'Live Web Search', ...(args.localModelInvoked ? ['Independent Local Reasoner'] : [])],
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
    researchDocumentsAcquired: args.sources.length,
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
  const live = await getExternalInfo(query, 10, { bypassCache: true })
  const sources = live.ok ? prepareFreshEvidence(live.results, 10) : []

  if (!live.ok || !freshEvidenceMeetsAuthority(input.prompt, sources)) {
    const reason = live.error
      ? `Live current-fact verification failed: ${live.error}`
      : 'Live current-fact verification did not produce enough independent authoritative evidence.'
    return {
      handled: false,
      confidence: 0,
      reason,
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources,
      }) as any,
    }
  }

  const resolved = resolveCosReasoner()
  if (!resolved.config) {
    return {
      handled: false,
      confidence: 0,
      reason: 'Live evidence was retrieved, but the independent local reasoner is not configured for grounded synthesis.',
      provenance: freshProvenance({
        reasonerLabel: null,
        localModelInvoked: false,
        retrievedAt,
        sources,
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
  })

  if (!reasoned?.text) {
    return {
      handled: false,
      confidence: 0,
      reason: 'Live evidence was retrieved, but independent local synthesis returned no answer.',
      provenance: provenance as any,
    }
  }

  const parsed = parseLocalResult(reasoned.text)
  if (!parsed || parsed.truncated) {
    return {
      handled: false,
      confidence: 0,
      reason: 'Live evidence was retrieved, but independent local synthesis was incomplete or unparseable.',
      provenance: provenance as any,
    }
  }

  const citesIndependentEvidence = replyCitesIndependentFreshEvidence(parsed.answer, input.prompt, sources)
  const confidence = Math.max(0, Math.min(1, parsed.confidence))
  if (!citesIndependentEvidence || confidence < confidenceThreshold()) {
    return {
      handled: false,
      confidence,
      reason: !citesIndependentEvidence
        ? 'Current-fact synthesis was rejected because it did not cite the required independent live sources.'
        : `Current-fact synthesis confidence ${confidence.toFixed(2)} is below threshold ${confidenceThreshold().toFixed(2)}.`,
      bestEffortReply: parsed.answer,
      provenance: provenance as any,
    }
  }

  return {
    handled: true,
    reply: parsed.answer,
    confidence,
    provenance: provenance as any,
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
  return tryEnterpriseCOSFirstAnswer(input)
}
