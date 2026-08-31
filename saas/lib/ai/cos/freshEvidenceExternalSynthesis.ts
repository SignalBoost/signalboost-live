import { resolveLocalPlaceDiscovery } from '@/lib/ai/cos/cosLocalDiscovery'
import { synthesizeFreshEvidenceLocally } from '@/lib/ai/cos/freshEvidenceLocalSynthesis'
import { splitResearchClaims } from '@/lib/ai/cos/cosClaimResearch'
import { callCosTextDetailed } from '@/lib/cos/textGateway'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'
import {
  diagnoseFreshEvidenceSemanticPlan,
  diagnoseFreshEvidenceSynthesis,
  freshEvidenceAnswerContractRepairPrompt,
  freshEvidenceScopePlanRepairPrompt,
} from '@/lib/ai/cos/freshEvidenceContractRecovery'
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
import {
  acceptFreshEvidencePredicateAudit,
  applyFreshEvidencePredicateAudit,
  freshEvidencePredicateAuditPrompt,
  freshEvidencePredicateAuditSystemPrompt,
} from '@/lib/ai/cos/freshEvidencePredicateAudit'

export type FreshEvidenceExternalSynthesis = {
  attempted: true
  accepted: boolean
  reply: string | null
  provider: string | null
  model: string | null
  source: 'deterministic' | 'local' | 'provider' | 'cache' | null
}

/**
 * Compatibility name retained for callers. The governed provider fallback must meet the same
 * scope-plan -> independent predicate audit -> answer -> contract repair -> faithfulness review
 * standard as local COS. A provider cannot bypass the two-key binary-release rule.
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

  let planned = await callCosTextDetailed({
    taskId: `cos-fresh-external-scope:${args.retrievedAt}`,
    prompt: freshEvidenceScopePlanPrompt(args),
    systemPrompt: freshEvidenceScopePlanSystemPrompt(args.language),
    modelPreference: 'gemini',
    maxTokens: 500,
  }).catch(() => null)
  if (!planned?.text) return rejected(planned)

  let semanticPlan = acceptFreshEvidenceSemanticPlan({ text: planned.text, sources: args.sources })
  const planDiagnosis = diagnoseFreshEvidenceSemanticPlan({ text: planned.text, sources: args.sources })
  if (!semanticPlan || planDiagnosis) {
    const diagnosis = planDiagnosis ?? { code: 'invalid_scope_shape', repairable: true } as const
    if (!diagnosis.repairable) return rejected(planned)
    const replanned = await callCosTextDetailed({
      taskId: `cos-fresh-external-scope-repair:${args.retrievedAt}`,
      prompt: freshEvidenceScopePlanRepairPrompt({
        ...args,
        failedPlanText: planned.text,
        failureCode: diagnosis.code,
      }),
      systemPrompt: freshEvidenceScopePlanSystemPrompt(args.language),
      modelPreference: 'gemini',
      maxTokens: 500,
    }).catch(() => null)
    if (!replanned?.text) return rejected(replanned ?? planned)
    semanticPlan = acceptFreshEvidenceSemanticPlan({ text: replanned.text, sources: args.sources })
    if (!semanticPlan || diagnoseFreshEvidenceSemanticPlan({ text: replanned.text, sources: args.sources })) {
      return rejected(replanned)
    }
    planned = replanned
  }

  const plannerPresentationMode = semanticPlan.presentationMode
  const plannerDirectBinaryAnswerSafe = semanticPlan.directBinaryAnswerSafe
  let predicateAudit = null
  let auditExecution = null
  if (plannerPresentationMode === 'direct' && plannerDirectBinaryAnswerSafe) {
    auditExecution = await callCosTextDetailed({
      taskId: `cos-fresh-external-predicate-audit:${args.retrievedAt}`,
      prompt: freshEvidencePredicateAuditPrompt(args),
      systemPrompt: freshEvidencePredicateAuditSystemPrompt(args.language),
      modelPreference: 'gemini',
      maxTokens: 220,
    }).catch(() => null)
    predicateAudit = auditExecution?.text ? acceptFreshEvidencePredicateAudit(auditExecution.text) : null
  }
  semanticPlan = applyFreshEvidencePredicateAudit(semanticPlan, predicateAudit)
  console.info('[cos-fresh-external-predicate-audit]', JSON.stringify({
    at: new Date().toISOString(),
    auditRequired: plannerPresentationMode === 'direct' && plannerDirectBinaryAnswerSafe,
    auditParsed: predicateAudit !== null,
    auditBinaryVerdictSafe: predicateAudit?.binaryVerdictSafe ?? null,
    auditRequiresNeutralEvidenceMap: predicateAudit?.requiresNeutralEvidenceMap ?? null,
    ambiguityKinds: predicateAudit?.ambiguityKinds ?? [],
    presentationMode: semanticPlan.presentationMode,
    directBinaryAnswerSafe: semanticPlan.directBinaryAnswerSafe,
  }))

  let answered = await callCosTextDetailed({
    taskId: `cos-fresh-external-answer:${args.retrievedAt}`,
    prompt: freshEvidenceSynthesisPrompt({ ...args, semanticPlan }),
    systemPrompt: freshEvidenceSynthesisSystemPrompt(args.language),
    modelPreference: 'gemini',
    maxTokens: 700,
  }).catch(() => null)
  if (!answered?.text) return rejected(answered ?? auditExecution ?? planned)

  let accepted = acceptFreshEvidenceSynthesis({
    text: answered.text,
    input: args.input,
    sources: args.sources,
    semanticPlan,
  })
  if (!accepted) {
    const diagnosis = diagnoseFreshEvidenceSynthesis({
      text: answered.text,
      input: args.input,
      sources: args.sources,
      semanticPlan,
    }) ?? { code: 'unknown_contract_rejection', repairable: true, draftAnswer: answered.text }
    if (!diagnosis.repairable) return rejected(answered)
    const repairedContract = await callCosTextDetailed({
      taskId: `cos-fresh-external-contract-repair:${args.retrievedAt}`,
      prompt: freshEvidenceAnswerContractRepairPrompt({
        ...args,
        semanticPlan,
        failedDraftText: answered.text,
        failureCode: diagnosis.code,
      }),
      systemPrompt: freshEvidenceRevisionSystemPrompt(args.language),
      modelPreference: 'gemini',
      maxTokens: 420,
    }).catch(() => null)
    if (!repairedContract?.text) return rejected(repairedContract ?? answered)
    accepted = acceptFreshEvidenceSynthesis({
      text: repairedContract.text,
      input: args.input,
      sources: args.sources,
      semanticPlan,
    })
    if (!accepted) return rejected(repairedContract)
    answered = repairedContract
  }

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
    answered = revised
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
