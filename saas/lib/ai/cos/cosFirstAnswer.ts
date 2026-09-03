// saas/lib/ai/cos/cosFirstAnswer.ts
// Thin shared entrypoint. The established COS routing pipeline lives in cosFirstAnswerCore.ts.
// Authenticated owner self-knowledge is handled here by neural semantic reasoning over trusted
// runtime topology facts; no canned owner model/spec answer is released from this entrypoint.

import { callCosReasoner } from './cosReasoner.ts'
import { ownerPlatformIdentityContext } from './platformIdentityContext.ts'
import { recordCosTurnExperience } from './cognitiveTurnExperience.ts'
import { isPublicDeliveryScope } from '@/lib/auth/publicDeliveryScope'
import {
  tryCOSFirstAnswer as tryCoreCOSFirstAnswer,
  type COSFirstAnswerResult,
} from './cosFirstAnswerCore.ts'

export * from './cosFirstAnswerCore.ts'

type COSFirstAnswerInput = Parameters<typeof tryCoreCOSFirstAnswer>[0]

type OwnerSelfKnowledgeDecision = Readonly<{
  relevant: boolean
  answer: string
  confidence: number
}>

function emptyStage() {
  return { retrieved: 0, relevant: 0, selected: 0, injected: 0, cited: 0 }
}

function parseOwnerSelfKnowledgeDecision(raw: string): OwnerSelfKnowledgeDecision | null {
  const value = String(raw || '').trim()
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(value.slice(start, end + 1)) as Record<string, unknown>
    if (typeof parsed.relevant !== 'boolean') return null
    const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
    const confidenceValue = Number(parsed.confidence)
    const confidence = Number.isFinite(confidenceValue)
      ? Math.max(0, Math.min(1, confidenceValue))
      : 0
    if (parsed.relevant && !answer) return null
    return { relevant: parsed.relevant, answer, confidence }
  } catch {
    return null
  }
}

function ownerNeuralProvenance(reasonerLabel: string | null) {
  return {
    responseSource: 'local_cos_reasoning',
    externalAiInvoked: false as const,
    localModelInvoked: true,
    reasonerLabel,
    internalSystemsConsulted: ['Owner Runtime Model Topology', 'Independent Local Reasoner'],
    knowledgeFactsUsed: 0,
    learnedItemsUsed: 0,
    enterpriseMemoriesUsed: 0,
    userMemoriesUsed: 0,
    cognitiveSkillsUsed: 0,
    enterpriseMemoryStatus: 'not_consulted_owner_runtime_self_knowledge',
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
    ownerSelfKnowledgeNeural: true,
    selfKnowledgeDeterministic: false,
  }
}

async function tryOwnerNeuralSelfKnowledge(
  input: COSFirstAnswerInput,
  options: { compatibilitySignal?: boolean } = {},
): Promise<COSFirstAnswerResult | null> {
  if (input.privileged !== true || isPublicDeliveryScope()) return null

  const runtimeContext = ownerPlatformIdentityContext()
  const reasoned = await callCosReasoner({
    temperature: 0,
    maxTokens: 1400,
    systemPrompt: [
      "You are COS's authenticated owner-channel semantic self-knowledge reasoner.",
      'Use neural semantic reasoning over the complete request. Do not use keyword rules, regex intent matching, canned replies, or answer templates.',
      'Return ONLY strict JSON: {"relevant":true|false,"answer":"...","confidence":0.0}.',
      'Set relevant=true only when the request is actually asking about, comparing, or materially depends on SignalBoost/COS/Concierge/Builder/Platform Engineer itself: its identity, models, provider, runtime, architecture, technical specs, or the relationship between its general and specialized model roles.',
      'A general question about AI models, a third-party product specification, or a writing request that merely contains model-related words is not platform self-knowledge; set relevant=false and answer="".',
      'When relevant=true, reason from the TRUSTED OWNER RUNTIME CONTEXT as authoritative current configuration facts. Compose the answer in your own words and at the level of detail the request warrants.',
      'Distinguish the general COS reasoner from Builder/Platform Engineer coding specialization whenever that distinction materially answers the question. Never imply that a specialist model powers the whole platform unless the supplied runtime facts say so.',
      'Do not invent parameters, hardware, context windows, training details, or provider facts that are absent from the trusted runtime context.',
      options.compatibilitySignal
        ? 'A compatibility pipeline suspected this might be platform self-knowledge. Treat that only as a weak signal; independently decide relevance from meaning.'
        : '',
      input.language ? `Answer in ${input.language}.` : 'Answer in the language of the user.',
    ].filter(Boolean).join(' '),
    prompt: [
      runtimeContext,
      `CURRENT OWNER REQUEST:\n${input.prompt}`,
      'Decide semantic relevance and, only if relevant, answer the owner now.',
    ].join('\n\n'),
  }).catch(error => {
    console.warn('[cos-owner-self-knowledge-neural] reasoner unavailable', error)
    return null
  })

  if (!reasoned?.text) return null
  const decision = parseOwnerSelfKnowledgeDecision(reasoned.text)
  if (!decision?.relevant || decision.confidence < 0.55) return null

  const provenance = ownerNeuralProvenance(reasoned.reasoner.label)
  const result = {
    handled: true,
    reply: decision.answer,
    confidence: decision.confidence,
    provenance,
  } as unknown as COSFirstAnswerResult

  await recordCosTurnExperience({
    prompt: input.prompt,
    handled: true,
    confidence: decision.confidence,
    provenance: provenance as any,
    failureReason: null,
  }).catch(() => undefined)

  return result
}

function coreReleasedCannedOwnerSelfKnowledge(result: COSFirstAnswerResult): boolean {
  if (!result.handled) return false
  const provenance = result.provenance as unknown as Record<string, unknown>
  const reply = String(result.reply || '')
  return provenance.selfKnowledgeDeterministic === true
    || /PLATFORM TECHNICAL SPECIFICATION \(owner-only\):/i.test(reply)
    || /^Owner channel:\s*this platform's COS reasoner is\b/i.test(reply)
    || /^Canal do owner:\s*o reasoner do COS nesta plataforma é\b/i.test(reply)
}

/**
 * Owner model/spec questions are decided and answered by the configured neural COS reasoner using
 * trusted runtime topology context. The old deterministic core remains temporarily behind this
 * compatibility entrypoint for the rest of the mature routing pipeline, but any canned owner
 * self-knowledge result is blocked from release and gets one neural semantic re-evaluation.
 */
export async function tryCOSFirstAnswer(input: COSFirstAnswerInput): Promise<COSFirstAnswerResult> {
  const neuralSelfKnowledge = await tryOwnerNeuralSelfKnowledge(input)
  if (neuralSelfKnowledge) return neuralSelfKnowledge

  const coreResult = await tryCoreCOSFirstAnswer(input)
  if (input.privileged !== true || isPublicDeliveryScope() || !coreReleasedCannedOwnerSelfKnowledge(coreResult)) {
    return coreResult
  }

  const neuralRetry = await tryOwnerNeuralSelfKnowledge(input, { compatibilitySignal: true })
  if (neuralRetry) return neuralRetry

  return {
    handled: false,
    confidence: 0,
    reason: 'Owner platform self-knowledge was identified, but neural semantic synthesis was unavailable. The deterministic compatibility answer was blocked rather than released.',
    provenance: {
      ...(coreResult.provenance as unknown as Record<string, unknown>),
      responseSource: 'external_fallback_required',
      selfKnowledgeDeterministicBlocked: true,
    } as any,
  }
}
