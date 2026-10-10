// saas/lib/ai/cos/freshEvidenceLocalSynthesis.ts
//
// TIER 2 OF THE FRESHNESS LADDER — COS reasons ONCE over this-turn live evidence.
//
// Until 2026-10-10 this file ran a four-to-seven call JSON state machine (planner, audit, answer,
// contract repair, reviewer, revision, final review) with ~20 deterministic
// exits, each able to discard a correct answer for a formality the model was never told about. A
// question with two corroborating live reports took 40–90 s and ended in "did not meet the
// verification requirement". That is not a thinking agent; it is a form with a model inside.
//
// Now: the same interactive lane that answers an ordinary question (`cos_interactive_answer`,
// thinking off, bounded) receives the evidence, the question, and the host's own release policy
// (which citations are required), and answers in prose with inline [LIVE#] citations. Deterministic
// code keeps only what deterministic code can truly verify: the cited ids exist and point at the
// retrieved sources, the output is safe for public delivery, and the authority policy's citation
// requirement is met. One repair call, stating exactly what is missing, when it is not. Nothing else
// stands between evidence and answer.

import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'
import { CHAT_ANSWER_LENGTH_RULE } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import {
  acceptFreshEvidenceGroundedAnswer,
  freshEvidenceGroundedAnswerPrompt,
  freshEvidenceGroundedRepairPrompt,
  FRESH_GROUNDED_ANSWER_MAX_TOKENS,
  FRESH_GROUNDED_ANSWER_TIMEOUT_MS,
  type FreshEvidenceGroundedPrompt,
  type FreshEvidenceGroundingRejection,
} from '@/lib/ai/cos/freshEvidenceGroundedAnswer'

export type { FreshEvidenceGroundingRejection } from '@/lib/ai/cos/freshEvidenceGroundedAnswer'

export type FreshEvidenceLocalSynthesis = {
  kind: 'accepted'
  reply: string
  reasonerLabel: string
  citedSourceIds: string[]
}

export type FreshEvidenceLocalSynthesisOutcome =
  | FreshEvidenceLocalSynthesis
  | { kind: 'local_synthesis_failed'; error: string }
  | { kind: 'local_synthesis_unparseable' }
  | { kind: 'citation_grounding_rejected'; reason: FreshEvidenceGroundingRejection }

const FRESH_GROUNDED_ANSWER_TEMPERATURE = 0.2

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function groundedAnswerCall(prompt: FreshEvidenceGroundedPrompt): Promise<{ text: string; label: string } | { error: string } | null> {
  try {
    const result = await callCosReasoner({
      ...prompt,
      temperature: FRESH_GROUNDED_ANSWER_TEMPERATURE,
      maxTokens: FRESH_GROUNDED_ANSWER_MAX_TOKENS,
      disableThinking: true,
      timeoutMs: FRESH_GROUNDED_ANSWER_TIMEOUT_MS,
      allowConfiguredFallback: true,
      usageContext: { feature: 'cos_interactive_answer', purpose: 'fresh_grounded_answer' },
    })
    if (!result?.text?.trim()) return null
    return { text: result.text, label: result.reasoner.label }
  } catch (error) {
    return { error: errorText(error) }
  }
}

export async function synthesizeFreshEvidenceLocally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceLocalSynthesisOutcome> {
  if (!args.sources.length) return { kind: 'local_synthesis_unparseable' }
  const startedAt = Date.now()

  // One bounded transport retry on a transient failure; never a different brain.
  let first = await groundedAnswerCall(freshEvidenceGroundedAnswerPrompt({ ...args, lengthRule: CHAT_ANSWER_LENGTH_RULE }))
  // The reasoner already performs governed fallback; do not replay the same timed-out request.
  if (!first) return { kind: 'local_synthesis_unparseable' }
  if ('error' in first) return { kind: 'local_synthesis_failed', error: first.error }

  let accepted = acceptFreshEvidenceGroundedAnswer({ text: first.text, input: args.input, sources: args.sources })
  let label = first.label
  let repaired = false
  if (!accepted.ok && accepted.reason && accepted.reason !== 'unsafe_public_output') {
    const second = await groundedAnswerCall(freshEvidenceGroundedRepairPrompt({ ...args, lengthRule: CHAT_ANSWER_LENGTH_RULE, draft: accepted.answer, reason: accepted.reason }))
    if (second && !('error' in second)) {
      repaired = true
      label = second.label
      accepted = acceptFreshEvidenceGroundedAnswer({ text: second.text, input: args.input, sources: args.sources })
    }
  }

  console.info('[cos-fresh-grounded-answer]', JSON.stringify({
    at: new Date().toISOString(),
    accepted: accepted.ok,
    reason: accepted.reason,
    repaired,
    citedSourceIds: accepted.citedSourceIds,
    sources: args.sources.length,
    latencyMs: Date.now() - startedAt,
  }))

  if (!accepted.ok) return { kind: 'citation_grounding_rejected', reason: accepted.reason ?? 'empty_answer' }
  const reasoner = resolveCosReasoner()
  return {
    kind: 'accepted',
    reply: accepted.reply,
    reasonerLabel: label || reasoner.config?.label || 'cos-reasoner',
    citedSourceIds: accepted.citedSourceIds,
  }
}
