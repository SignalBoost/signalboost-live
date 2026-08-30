// TIER 2 OF THE FRESHNESS LADDER — bounded local Qwen reasoning over this-turn live evidence.
// Semantic interpretation is model-owned: Qwen plans the materially distinct evidence scopes,
// writes the answer under that plan, and neurally reviews multi-scope answers for faithfulness.
// Deterministic code validates structure, evidence ids, citation policy and output density only.

import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'
import { splitResearchClaims } from '@/lib/ai/cos/cosClaimResearch'
import {
  diagnoseFreshEvidenceSemanticPlan,
  diagnoseFreshEvidenceSynthesis,
  freshEvidenceAnswerContractRepairPrompt,
  freshEvidenceScopePlanRepairPrompt,
  type FreshEvidenceContractDiagnosis,
  type FreshEvidencePlanDiagnosis,
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
  type AcceptedFreshEvidenceSynthesis,
  type FreshEvidenceFaithfulnessReview,
  type FreshEvidenceSemanticPlan,
} from '@/lib/ai/cos/freshEvidenceSynthesisContract'
import {
  boundedFreshSynthesisAttemptTimeoutMs,
  freshSynthesisNullIndicatesTimeout,
  runFreshSynthesisTransportAttempts,
} from './freshEvidenceRetryPolicy.ts'

export type FreshEvidenceLocalSynthesis = {
  kind: 'accepted'
  reply: string
  reasonerLabel: string
}

export type FreshEvidenceLocalSynthesisOutcome =
  | FreshEvidenceLocalSynthesis
  | { kind: 'local_synthesis_failed'; error: string }
  | { kind: 'local_synthesis_unparseable' }
  | { kind: 'citation_grounding_rejected' }

const SCOPE_PLAN_MAX_TOKENS = 500
const ANSWER_MAX_TOKENS = 700
const FAITHFULNESS_REVIEW_MAX_TOKENS = 220
const REVISION_MAX_TOKENS = 420
const TEMPERATURE = 0.1

type LocalCompletionOutcome =
  | { ok: true; text: string | null }
  | { ok: false; error: string }

type SynthesisPhase =
  | 'scope_plan'
  | 'scope_plan_repair'
  | 'answer'
  | 'contract_repair'
  | 'faithfulness_review'
  | 'neural_review'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function boundedLocalCompletion(args: {
  prompt: string
  systemPrompt: string
  maxTokens: number
  phase: SynthesisPhase
}): Promise<LocalCompletionOutcome> {
  const baseConfig = localInferenceConfigFromEnv()
  const attemptTimeoutMs = boundedFreshSynthesisAttemptTimeoutMs(baseConfig.timeoutMs)

  try {
    const result = await runFreshSynthesisTransportAttempts(
      async () => {
        const attemptStartedAt = Date.now()
        const value = await callLocalModel({
          prompt: args.prompt,
          systemPrompt: args.systemPrompt,
          maxTokens: args.maxTokens,
          temperature: TEMPERATURE,
        }, {
          ...baseConfig,
          timeoutMs: attemptTimeoutMs,
        })
        const elapsedMs = Date.now() - attemptStartedAt
        if (freshSynthesisNullIndicatesTimeout(value, elapsedMs, attemptTimeoutMs)) {
          throw new Error(`Local inference attempt exhausted its ${attemptTimeoutMs}ms timeout budget`)
        }
        return value
      },
      ({ attempt, nextAttempt, error }) => {
        console.warn('[cos-fresh-local-synthesis-retry]', JSON.stringify({
          at: new Date().toISOString(),
          phase: args.phase,
          attempt,
          nextAttempt,
          attemptTimeoutMs,
          reason: errorText(error),
        }))
      },
    )
    return { ok: true, text: result.value }
  } catch (error) {
    console.warn('[cos-fresh-local-synthesis] failed closed after bounded local retry', JSON.stringify({
      at: new Date().toISOString(),
      phase: args.phase,
      attemptTimeoutMs,
      reason: errorText(error),
    }))
    return { ok: false, error: errorText(error) }
  }
}

async function repairSemanticPlan(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
  failedPlanText: string
  diagnosis: FreshEvidencePlanDiagnosis
}): Promise<
  | { kind: 'accepted'; semanticPlan: FreshEvidenceSemanticPlan }
  | { kind: 'local_synthesis_failed'; error: string }
  | { kind: 'rejected' }
> {
  if (!args.diagnosis.repairable) return { kind: 'rejected' }
  console.info('[cos-fresh-contract-repair]', JSON.stringify({
    at: new Date().toISOString(),
    event: 'repair_required',
    phase: 'scope_plan',
    failureCode: args.diagnosis.code,
  }))
  const repaired = await boundedLocalCompletion({
    prompt: freshEvidenceScopePlanRepairPrompt({
      input: args.input,
      sources: args.sources,
      retrievedAt: args.retrievedAt,
      failedPlanText: args.failedPlanText,
      failureCode: args.diagnosis.code,
    }),
    systemPrompt: freshEvidenceScopePlanSystemPrompt(args.language),
    maxTokens: SCOPE_PLAN_MAX_TOKENS,
    phase: 'scope_plan_repair',
  })
  if (repaired.ok === false) return { kind: 'local_synthesis_failed', error: repaired.error }
  if (!repaired.text?.trim()) return { kind: 'rejected' }

  const semanticPlan = acceptFreshEvidenceSemanticPlan({ text: repaired.text, sources: args.sources })
  const finalDiagnosis = diagnoseFreshEvidenceSemanticPlan({ text: repaired.text, sources: args.sources })
  if (!semanticPlan || finalDiagnosis) {
    console.warn('[cos-fresh-contract-repair]', JSON.stringify({
      at: new Date().toISOString(),
      event: 'repair_rejected',
      phase: 'scope_plan',
      failureCode: finalDiagnosis?.code ?? 'unknown_contract_rejection',
    }))
    return { kind: 'rejected' }
  }
  console.info('[cos-fresh-contract-repair]', JSON.stringify({
    at: new Date().toISOString(),
    event: 'repair_accepted',
    phase: 'scope_plan',
    scopeCount: semanticPlan.scopes.length,
    directBinaryAnswerSafe: semanticPlan.directBinaryAnswerSafe,
  }))
  return { kind: 'accepted', semanticPlan }
}

async function repairAnswerContract(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
  semanticPlan: FreshEvidenceSemanticPlan
  failedDraftText: string
  diagnosis: FreshEvidenceContractDiagnosis
}): Promise<
  | { kind: 'accepted'; accepted: AcceptedFreshEvidenceSynthesis }
  | { kind: 'local_synthesis_failed'; error: string }
  | { kind: 'rejected' }
> {
  if (!args.diagnosis.repairable) return { kind: 'rejected' }
  console.info('[cos-fresh-contract-repair]', JSON.stringify({
    at: new Date().toISOString(),
    event: 'repair_required',
    phase: 'answer_contract',
    failureCode: args.diagnosis.code,
    scopeCount: args.semanticPlan.scopes.length,
  }))
  const repaired = await boundedLocalCompletion({
    prompt: freshEvidenceAnswerContractRepairPrompt({
      input: args.input,
      sources: args.sources,
      retrievedAt: args.retrievedAt,
      semanticPlan: args.semanticPlan,
      failedDraftText: args.failedDraftText,
      failureCode: args.diagnosis.code,
    }),
    systemPrompt: freshEvidenceRevisionSystemPrompt(args.language),
    maxTokens: REVISION_MAX_TOKENS,
    phase: 'contract_repair',
  })
  if (repaired.ok === false) return { kind: 'local_synthesis_failed', error: repaired.error }
  if (!repaired.text?.trim()) return { kind: 'rejected' }

  const accepted = acceptFreshEvidenceSynthesis({
    text: repaired.text,
    input: args.input,
    sources: args.sources,
    semanticPlan: args.semanticPlan,
  })
  if (!accepted) {
    const finalDiagnosis = diagnoseFreshEvidenceSynthesis({
      text: repaired.text,
      input: args.input,
      sources: args.sources,
      semanticPlan: args.semanticPlan,
    })
    console.warn('[cos-fresh-contract-repair]', JSON.stringify({
      at: new Date().toISOString(),
      event: 'repair_rejected',
      phase: 'answer_contract',
      failureCode: finalDiagnosis?.code ?? 'unknown_contract_rejection',
    }))
    return { kind: 'rejected' }
  }
  console.info('[cos-fresh-contract-repair]', JSON.stringify({
    at: new Date().toISOString(),
    event: 'repair_accepted',
    phase: 'answer_contract',
    evidenceCount: accepted.citedSourceIds.length,
    scopeCount: accepted.scopeIds.length,
    answerChars: accepted.answer.length,
  }))
  return { kind: 'accepted', accepted }
}

async function reviewScopeFaithfulness(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
  semanticPlan: FreshEvidenceSemanticPlan
  answer: string
}): Promise<
  | { kind: 'reviewed'; review: FreshEvidenceFaithfulnessReview }
  | { kind: 'local_synthesis_failed'; error: string }
  | { kind: 'unparseable' }
> {
  const result = await boundedLocalCompletion({
    prompt: freshEvidenceFaithfulnessReviewPrompt(args),
    systemPrompt: freshEvidenceFaithfulnessReviewSystemPrompt(args.language),
    maxTokens: FAITHFULNESS_REVIEW_MAX_TOKENS,
    phase: 'faithfulness_review',
  })
  if (result.ok === false) return { kind: 'local_synthesis_failed', error: result.error }
  if (!result.text?.trim()) return { kind: 'unparseable' }
  const review = acceptFreshEvidenceFaithfulnessReview({ text: result.text, semanticPlan: args.semanticPlan })
  return review ? { kind: 'reviewed', review } : { kind: 'unparseable' }
}

/**
 * Answer a volatile/current-fact question from live evidence using one semantic reasoner pipeline:
 * 1. Qwen plans the smallest materially distinct semantic scopes required by QUESTION + evidence.
 * 2. A contradictory/structurally invalid plan gets one bounded neural repair before refusal.
 * 3. Qwen writes the answer under that plan. A repairable answer-contract defect gets one bounded
 *    neural repair with the exact machine-readable failure code instead of an immediate false refusal.
 * 4. When multiple scopes matter, Qwen independently checks that the prose did not drop or merge them.
 * 5. A bounded Qwen repair runs when scope faithfulness or output density fails, then multi-scope
 *    answers are reviewed again. Remaining semantic collapse or grounding defects fail closed.
 *
 * Scope planning/review are concise model verdicts, not hidden chain-of-thought. No deterministic
 * topic rule decides what the user's predicate means, and no server formatter writes answer prose.
 */
export async function synthesizeFreshEvidenceLocally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceLocalSynthesisOutcome> {
  if (!args.sources.length) return { kind: 'local_synthesis_unparseable' }

  const planned = await boundedLocalCompletion({
    prompt: freshEvidenceScopePlanPrompt(args),
    systemPrompt: freshEvidenceScopePlanSystemPrompt(args.language),
    maxTokens: SCOPE_PLAN_MAX_TOKENS,
    phase: 'scope_plan',
  })
  if (planned.ok === false) return { kind: 'local_synthesis_failed', error: planned.error }
  if (!planned.text?.trim()) return { kind: 'local_synthesis_unparseable' }

  let semanticPlan = acceptFreshEvidenceSemanticPlan({ text: planned.text, sources: args.sources })
  const planDiagnosis = diagnoseFreshEvidenceSemanticPlan({ text: planned.text, sources: args.sources })
  if (!semanticPlan || planDiagnosis) {
    const diagnosis = planDiagnosis ?? { code: 'invalid_scope_shape', repairable: true } as FreshEvidencePlanDiagnosis
    const repairedPlan = await repairSemanticPlan({ ...args, failedPlanText: planned.text, diagnosis })
    if (repairedPlan.kind === 'local_synthesis_failed') return repairedPlan
    if (repairedPlan.kind === 'rejected') return { kind: 'citation_grounding_rejected' }
    semanticPlan = repairedPlan.semanticPlan
  }

  console.info('[cos-fresh-semantic-scope-plan]', JSON.stringify({
    at: new Date().toISOString(),
    directBinaryAnswerSafe: semanticPlan.directBinaryAnswerSafe,
    scopeCount: semanticPlan.scopes.length,
    scopeEvidenceCount: new Set(semanticPlan.scopes.flatMap(scope => scope.evidenceIds)).size,
  }))

  const answered = await boundedLocalCompletion({
    prompt: freshEvidenceSynthesisPrompt({ ...args, semanticPlan }),
    systemPrompt: freshEvidenceSynthesisSystemPrompt(args.language),
    maxTokens: ANSWER_MAX_TOKENS,
    phase: 'answer',
  })
  if (answered.ok === false) return { kind: 'local_synthesis_failed', error: answered.error }
  if (!answered.text?.trim()) return { kind: 'local_synthesis_unparseable' }

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
    }) ?? { code: 'unknown_contract_rejection', repairable: true, draftAnswer: answered.text.trim() }
    const repairedContract = await repairAnswerContract({
      ...args,
      semanticPlan,
      failedDraftText: answered.text,
      diagnosis,
    })
    if (repairedContract.kind === 'local_synthesis_failed') return repairedContract
    if (repairedContract.kind === 'rejected') return { kind: 'citation_grounding_rejected' }
    accepted = repairedContract.accepted
  }

  const singleProposition = splitResearchClaims(args.input).length === 1
  const multiScopeReviewRequired = !semanticPlan.directBinaryAnswerSafe || semanticPlan.scopes.length > 1
  let faithfulnessReview: FreshEvidenceFaithfulnessReview | null = null

  if (multiScopeReviewRequired) {
    const reviewed = await reviewScopeFaithfulness({ ...args, semanticPlan, answer: accepted.answer })
    if (reviewed.kind === 'local_synthesis_failed') return reviewed
    if (reviewed.kind === 'unparseable') return { kind: 'citation_grounding_rejected' }
    faithfulnessReview = reviewed.review
    console.info('[cos-fresh-scope-faithfulness-review]', JSON.stringify({
      at: new Date().toISOString(),
      faithful: faithfulnessReview.faithful,
      missingScopeCount: faithfulnessReview.missingScopeIds.length,
      collapsedScopeCount: faithfulnessReview.collapsedScopeIds.length,
    }))
  }

  const densityReviewRequired = freshEvidenceSynthesisNeedsNeuralReview({
    answer: accepted.answer,
    citedSourceIds: accepted.citedSourceIds,
    singleProposition,
    semanticPlan,
  })
  const semanticRepairRequired = Boolean(faithfulnessReview && !faithfulnessReview.faithful)

  if (densityReviewRequired || semanticRepairRequired) {
    console.info('[cos-fresh-neural-synthesis-review]', JSON.stringify({
      at: new Date().toISOString(),
      event: 'review_required',
      reason: semanticRepairRequired ? 'scope_faithfulness' : 'output_density',
      singleProposition,
      directBinaryAnswerSafe: semanticPlan.directBinaryAnswerSafe,
      scopeCount: semanticPlan.scopes.length,
      initialEvidenceCount: accepted.citedSourceIds.length,
      initialAnswerChars: accepted.answer.length,
    }))

    const revised = await boundedLocalCompletion({
      prompt: freshEvidenceRevisionPrompt({
        input: args.input,
        sources: args.sources,
        retrievedAt: args.retrievedAt,
        semanticPlan,
        draftAnswer: accepted.answer,
        faithfulnessReview,
      }),
      systemPrompt: freshEvidenceRevisionSystemPrompt(args.language),
      maxTokens: REVISION_MAX_TOKENS,
      phase: 'neural_review',
    })
    if (revised.ok === false) return { kind: 'local_synthesis_failed', error: revised.error }
    if (!revised.text?.trim()) return { kind: 'local_synthesis_unparseable' }

    const repaired = acceptFreshEvidenceSynthesis({
      text: revised.text,
      input: args.input,
      sources: args.sources,
      semanticPlan,
    })
    if (!repaired) {
      const diagnosis = diagnoseFreshEvidenceSynthesis({
        text: revised.text,
        input: args.input,
        sources: args.sources,
        semanticPlan,
      })
      console.warn('[cos-fresh-neural-synthesis-review]', JSON.stringify({
        at: new Date().toISOString(),
        event: 'review_failed_quality_boundary',
        reason: diagnosis?.code ?? 'unknown_contract_rejection',
      }))
      return { kind: 'citation_grounding_rejected' }
    }
    if (freshEvidenceSynthesisNeedsNeuralReview({
      answer: repaired.answer,
      citedSourceIds: repaired.citedSourceIds,
      singleProposition,
      semanticPlan,
    })) {
      console.warn('[cos-fresh-neural-synthesis-review]', JSON.stringify({
        at: new Date().toISOString(),
        event: 'review_failed_quality_boundary',
        reason: 'output_density',
        finalEvidenceCount: repaired.citedSourceIds.length,
        finalAnswerChars: repaired.answer.length,
      }))
      return { kind: 'citation_grounding_rejected' }
    }

    if (multiScopeReviewRequired) {
      const finalReview = await reviewScopeFaithfulness({ ...args, semanticPlan, answer: repaired.answer })
      if (finalReview.kind === 'local_synthesis_failed') return finalReview
      if (finalReview.kind === 'unparseable' || !finalReview.review.faithful) {
        console.warn('[cos-fresh-neural-synthesis-review]', JSON.stringify({
          at: new Date().toISOString(),
          event: 'review_failed_quality_boundary',
          reason: 'scope_faithfulness',
          finalMissingScopeCount: finalReview.kind === 'reviewed' ? finalReview.review.missingScopeIds.length : null,
          finalCollapsedScopeCount: finalReview.kind === 'reviewed' ? finalReview.review.collapsedScopeIds.length : null,
        }))
        return { kind: 'citation_grounding_rejected' }
      }
    }

    console.info('[cos-fresh-neural-synthesis-review]', JSON.stringify({
      at: new Date().toISOString(),
      event: 'review_accepted',
      directBinaryAnswerSafe: semanticPlan.directBinaryAnswerSafe,
      scopeCount: semanticPlan.scopes.length,
      finalEvidenceCount: repaired.citedSourceIds.length,
      finalAnswerChars: repaired.answer.length,
    }))
    accepted = repaired
  }

  const reasoner = resolveCosReasoner()
  return {
    kind: 'accepted',
    reply: accepted.reply,
    reasonerLabel: reasoner.config?.label ?? `independent-local:${(process.env.LOCAL_AI_MODEL || 'local-model').trim()}`,
  }
}
