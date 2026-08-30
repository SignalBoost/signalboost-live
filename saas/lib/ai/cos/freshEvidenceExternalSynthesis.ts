import { resolveLocalPlaceDiscovery } from '@/lib/ai/cos/cosLocalDiscovery'
import { synthesizeFreshEvidenceLocally } from '@/lib/ai/cos/freshEvidenceLocalSynthesis'
import { splitResearchClaims } from '@/lib/ai/cos/cosClaimResearch'
import { callCosTextDetailed } from '@/lib/cos/textGateway'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'
import {
  acceptFreshEvidenceFaithfulnessReview,
  acceptFreshEvidenceSemanticPlan,
  acceptFreshEvidenceSynthesis,
  freshEvidenceFaithfulnessReviewPrompt,
  freshEvidenceFaithfulnessReviewSystemPrompt,
  freshEvidenceRevisionPrompt,
  freshEvidenceRevisionSystemPrompt,
  freshEvidenceScopePlanPrompt,
  freshEvidenceScopePlanSystemPrompt,
  freshEvidenceSynthesisNeedsNeuralReview,
  freshEvidenceSynthesisPrompt,
  freshEvidenceSynthesisSystemPrompt,
} from '@/lib/ai/cos/freshEvidenceSynthesisContract'

export type FreshEvidenceExternalSynthesis = {
  attempted: true
  accepted: boolean
  reply: string | null
  provider: string | null
  model: string | null
  source: 'deterministic' | 'local' | 'provider' | 'cache' | null
}

/**
 * Compatibility name retained for callers. The final governed provider fallback must meet the same
 * semantic scope-plan -> answer -> faithfulness-review -> repair/review contract as local Qwen.
 * It cannot bypass the semantic/evidence validator or release a weaker answer standard.
 */
export async function synthesizeFreshEvidenceExternally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceExternalSynthesis> {
  const rejected = (execution?: { provider?: string | null; model?: string | null; source?: 'provider' | 'cache' | null } | null): FreshEvidenceExternalSynthesis => ({
    attempted: true,
    accepted: false,
    reply: null,
    provider: execution?.provider ?? null,
    model: execution?.model ?? null,
    source: execution?.source ?? null,
  })

  if (!args.sources.length) return rejected()

  const deterministic = resolveLocalPlaceDiscovery(args.input, args.sources, args.language)
  if (deterministic) {
    return {
      attempted: true,
      accepted: true,
      reply: deterministic.reply,
      provider: null,
      model: null,
      source: 'deterministic',
    }
  }

  const local = await synthesizeFreshEvidenceLocally(args)
  if (local.kind === 'accepted') {
    return {
      attempted: true,
      accepted: true,
      reply: local.reply,
      provider: 'local',
      model: local.reasonerLabel,
      source: 'local',
    }
  }

  const planned = await callCosTextDetailed({
    taskId: `cos-fresh-external-scope:${args.retrievedAt}`,
    prompt: freshEvidenceScopePlanPrompt(args),
    systemPrompt: freshEvidenceScopePlanSystemPrompt(args.language),
    modelPreference: 'gemini',
    maxTokens: 500,
  }).catch(() => null)
  if (!planned?.text) return rejected(planned)

  const semanticPlan = acceptFreshEvidenceSemanticPlan({ text: planned.text, sources: args.sources })
  if (!semanticPlan) return rejected(planned)

  const answered = await callCosTextDetailed({
    taskId: `cos-fresh-external-answer:${args.retrievedAt}`,
    prompt: freshEvidenceSynthesisPrompt({ ...args, semanticPlan }),
    systemPrompt: freshEvidenceSynthesisSystemPrompt(args.language),
    modelPreference: 'gemini',
    maxTokens: 700,
  }).catch(() => null)
  if (!answered?.text) return rejected(answered ?? planned)

  let accepted = acceptFreshEvidenceSynthesis({
    text: answered.text,
    input: args.input,
    sources: args.sources,
    semanticPlan,
  })
  if (!accepted) return rejected(answered)

  const singleProposition = splitResearchClaims(args.input).length === 1
  const multiScopeReviewRequired = !semanticPlan.directBinaryAnswerSafe || semanticPlan.scopes.length > 1
  let faithfulnessReview = null

  if (multiScopeReviewRequired) {
    const reviewed = await callCosTextDetailed({
      taskId: `cos-fresh-external-faithfulness:${args.retrievedAt}`,
      prompt: freshEvidenceFaithfulnessReviewPrompt({ ...args, semanticPlan, answer: accepted.answer }),
      systemPrompt: freshEvidenceFaithfulnessReviewSystemPrompt(args.language),
      modelPreference: 'gemini',
      maxTokens: 220,
    }).catch(() => null)
    if (!reviewed?.text) return rejected(reviewed ?? answered)
    faithfulnessReview = acceptFreshEvidenceFaithfulnessReview({ text: reviewed.text, semanticPlan })
    if (!faithfulnessReview) return rejected(reviewed)
  }

  const densityReviewRequired = freshEvidenceSynthesisNeedsNeuralReview({
    answer: accepted.answer,
    citedSourceIds: accepted.citedSourceIds,
    singleProposition,
    semanticPlan,
  })
  const semanticRepairRequired = Boolean(faithfulnessReview && !faithfulnessReview.faithful)

  if (densityReviewRequired || semanticRepairRequired) {
    const revised = await callCosTextDetailed({
      taskId: `cos-fresh-external-repair:${args.retrievedAt}`,
      prompt: freshEvidenceRevisionPrompt({
        ...args,
        semanticPlan,
        draftAnswer: accepted.answer,
        faithfulnessReview,
      }),
      systemPrompt: freshEvidenceRevisionSystemPrompt(args.language),
      modelPreference: 'gemini',
      maxTokens: 420,
    }).catch(() => null)
    if (!revised?.text) return rejected(revised ?? answered)

    const repaired = acceptFreshEvidenceSynthesis({
      text: revised.text,
      input: args.input,
      sources: args.sources,
      semanticPlan,
    })
    if (!repaired || freshEvidenceSynthesisNeedsNeuralReview({
      answer: repaired.answer,
      citedSourceIds: repaired.citedSourceIds,
      singleProposition,
      semanticPlan,
    })) return rejected(revised)

    if (multiScopeReviewRequired) {
      const finalReviewResult = await callCosTextDetailed({
        taskId: `cos-fresh-external-final-faithfulness:${args.retrievedAt}`,
        prompt: freshEvidenceFaithfulnessReviewPrompt({ ...args, semanticPlan, answer: repaired.answer }),
        systemPrompt: freshEvidenceFaithfulnessReviewSystemPrompt(args.language),
        modelPreference: 'gemini',
        maxTokens: 220,
      }).catch(() => null)
      if (!finalReviewResult?.text) return rejected(finalReviewResult ?? revised)
      const finalReview = acceptFreshEvidenceFaithfulnessReview({ text: finalReviewResult.text, semanticPlan })
      if (!finalReview?.faithful) return rejected(finalReviewResult)
    }

    accepted = repaired
  }

  return {
    attempted: true,
    accepted: true,
    reply: accepted.reply,
    provider: answered.provider ?? null,
    model: answered.model ?? null,
    source: answered.source,
  }
}
