// TIER 2 OF THE FRESHNESS LADDER — bounded local Qwen reasoning over this-turn live evidence.
// Semantic interpretation is model-owned: Qwen first plans the materially distinct evidence scopes,
// then writes the answer under that plan. Deterministic code validates only structure, evidence ids,
// citation policy and output density; it never chooses the semantic conclusion.

import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'
import { splitResearchClaims } from '@/lib/ai/cos/cosClaimResearch'
import {
  acceptFreshEvidenceSemanticPlan,
  acceptFreshEvidenceSynthesis,
  freshEvidenceRevisionPrompt,
  freshEvidenceRevisionSystemPrompt,
  freshEvidenceScopePlanPrompt,
  freshEvidenceScopePlanSystemPrompt,
  freshEvidenceSynthesisNeedsNeuralReview,
  freshEvidenceSynthesisPrompt,
  freshEvidenceSynthesisSystemPrompt,
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
const REVISION_MAX_TOKENS = 420
const TEMPERATURE = 0.1

type LocalCompletionOutcome =
  | { ok: true; text: string | null }
  | { ok: false; error: string }

type SynthesisPhase = 'scope_plan' | 'answer' | 'neural_review'

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

/**
 * Answer a volatile/current-fact question from live evidence using one semantic reasoner pipeline:
 * 1. Qwen plans the smallest materially distinct semantic scopes required by QUESTION + evidence.
 * 2. Qwen writes the answer under that scope plan.
 * 3. Only if the answer is still source-heavy/overlong, Qwen performs a bounded final edit while
 *    preserving the same scope plan.
 *
 * The scope plan is a concise model conclusion, not hidden reasoning. No deterministic topic rule
 * decides what the user's predicate means, and no server formatter writes ordinary answer prose.
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

  const semanticPlan = acceptFreshEvidenceSemanticPlan({ text: planned.text, sources: args.sources })
  if (!semanticPlan) return { kind: 'citation_grounding_rejected' }

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
  if (!accepted) return { kind: 'citation_grounding_rejected' }

  const singleProposition = splitResearchClaims(args.input).length === 1
  const needsNeuralReview = freshEvidenceSynthesisNeedsNeuralReview({
    answer: accepted.answer,
    citedSourceIds: accepted.citedSourceIds,
    singleProposition,
    semanticPlan,
  })

  if (needsNeuralReview) {
    console.info('[cos-fresh-neural-synthesis-review]', JSON.stringify({
      at: new Date().toISOString(),
      event: 'review_required',
      reason: accepted.citedSourceIds.length > Math.max(2, semanticPlan.scopes.length) ? 'source_density' : 'answer_length',
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
      }),
      systemPrompt: freshEvidenceRevisionSystemPrompt(args.language),
      maxTokens: REVISION_MAX_TOKENS,
      phase: 'neural_review',
    })
    if (revised.ok === false) return { kind: 'local_synthesis_failed', error: revised.error }
    if (!revised.text?.trim()) return { kind: 'local_synthesis_unparseable' }

    const reviewed = acceptFreshEvidenceSynthesis({
      text: revised.text,
      input: args.input,
      sources: args.sources,
      semanticPlan,
    })
    if (!reviewed) return { kind: 'citation_grounding_rejected' }
    if (freshEvidenceSynthesisNeedsNeuralReview({
      answer: reviewed.answer,
      citedSourceIds: reviewed.citedSourceIds,
      singleProposition,
      semanticPlan,
    })) {
      console.warn('[cos-fresh-neural-synthesis-review]', JSON.stringify({
        at: new Date().toISOString(),
        event: 'review_failed_quality_boundary',
        directBinaryAnswerSafe: semanticPlan.directBinaryAnswerSafe,
        scopeCount: semanticPlan.scopes.length,
        finalEvidenceCount: reviewed.citedSourceIds.length,
        finalAnswerChars: reviewed.answer.length,
      }))
      return { kind: 'citation_grounding_rejected' }
    }

    console.info('[cos-fresh-neural-synthesis-review]', JSON.stringify({
      at: new Date().toISOString(),
      event: 'review_accepted',
      directBinaryAnswerSafe: semanticPlan.directBinaryAnswerSafe,
      scopeCount: semanticPlan.scopes.length,
      finalEvidenceCount: reviewed.citedSourceIds.length,
      finalAnswerChars: reviewed.answer.length,
    }))
    accepted = reviewed
  }

  const reasoner = resolveCosReasoner()
  return {
    kind: 'accepted',
    reply: accepted.reply,
    reasonerLabel: reasoner.config?.label ?? `independent-local:${(process.env.LOCAL_AI_MODEL || 'local-model').trim()}`,
  }
}
