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
import { hasUnsafePublicModelOutput } from '@/lib/ai/cos/publicPromptSecurity'
import {
  acceptFreshEvidenceGroundedAnswer,
  freshEvidenceGroundedAnswerPrompt,
  freshEvidenceGroundedRepairPrompt,
  extractGroundedJsonAnswer,
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
  /** rejectedDraftHead: owner-diagnostic excerpt of the rejected draft; omitted for unsafe text. */
  | { kind: 'citation_grounding_rejected'; reason: FreshEvidenceGroundingRejection; rejectedDraftHead?: string }

const FRESH_GROUNDED_ANSWER_TEMPERATURE = 0.2

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function groundedAnswerCall(prompt: FreshEvidenceGroundedPrompt, structured = false): Promise<{ text: string; label: string } | { error: string } | null> {
  try {
    const result = await callCosReasoner({
      ...prompt,
      ...(structured ? { jsonObject: true, systemPrompt: prompt.systemPrompt + '\nReturn only a JSON object containing an answer string with inline citations. No analysis.' } : {}),
      temperature: FRESH_GROUNDED_ANSWER_TEMPERATURE,
      maxTokens: FRESH_GROUNDED_ANSWER_MAX_TOKENS,
      disableThinking: true,
      timeoutMs: FRESH_GROUNDED_ANSWER_TIMEOUT_MS,
      // Production 2026-10-10 20:34–20:35: the pod answered in 9.4–10 s every time with finish=length at the cap,
      // and local-inference threw the text away (LOCAL_MODEL_OUTPUT_TRUNCATED), so the retry and the 20 s backup
      // ran for nothing. A length-capped prose answer IS the answer: keep it, trim it to a complete sentence,
      // and let acceptance judge it on its citations.
      allowTruncatedText: true,
      allowConfiguredFallback: true,
      usageContext: { feature: 'cos_interactive_answer', purpose: 'fresh_grounded_answer' },
    })
    if (!result?.text?.trim()) return null
    let answerText = result.text
    if (structured) {
      try {
        const parsed = JSON.parse(answerText)
        if (typeof parsed?.answer !== 'string' || !parsed.answer.trim()) return null
        answerText = parsed.answer
      } catch {
        // A reply cut off by the token cap is unterminated JSON; its answer field still holds complete sentences.
        // A provider that ignored JSON mode returns prose, which goes through the same release filter.
        const cut = extractGroundedJsonAnswer(answerText)
        if (cut?.trim()) answerText = cut
      }
    }
    return { text: answerText, label: result.reasoner?.label || 'cos-reasoner' }
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
  let first = await groundedAnswerCall(freshEvidenceGroundedAnswerPrompt({ ...args, lengthRule: CHAT_ANSWER_LENGTH_RULE }), true)
  // Retry once if the primary provider and governed fallback both produce no usable text.
  // This is a bounded recovery for transient empty responses; the normal citation repair remains separate.
  if (!first || 'error' in first) first = await groundedAnswerCall(freshEvidenceGroundedAnswerPrompt({ ...args, lengthRule: CHAT_ANSWER_LENGTH_RULE }), true)
  if (!first) return { kind: 'local_synthesis_unparseable' }
  if ('error' in first) return { kind: 'local_synthesis_failed', error: first.error }

  let accepted = acceptFreshEvidenceGroundedAnswer({ text: first.text, input: args.input, sources: args.sources })
  let label = first.label
  let lastDraft = first.text
  let repaired = false
  // A rejected process-narration draft is not a completed answer. Give it one bounded
  // repair attempt even when first inference crosses 12 seconds; production examples
  // on 2026-10-11 repeatedly ended at ~12.2 seconds without any repair. Other
  // acceptance failures retain the existing latency guard.
  if (!accepted.ok && accepted.reason && accepted.reason !== 'unsafe_public_output' && (accepted.reason === 'process_narration' || Date.now() - startedAt < 12_000)) {
    console.info('[cos-fresh-grounded-repair-start]', JSON.stringify({ reason: accepted.reason, elapsedMs: Date.now() - startedAt, sources: args.sources.length }))
    const second = await groundedAnswerCall(freshEvidenceGroundedRepairPrompt({ ...args, lengthRule: CHAT_ANSWER_LENGTH_RULE, draft: accepted.reason === 'process_narration' ? '' : accepted.answer, reason: accepted.reason }), accepted.reason === 'process_narration')
    if (!second || 'error' in second) console.warn('[cos-fresh-grounded-repair-unavailable]', JSON.stringify({ reason: accepted.reason, errorCode: !second ? 'empty_response' : 'inference_error' }))
    if (second && !('error' in second)) {
      repaired = true
      label = second.label
      lastDraft = second.text
      accepted = acceptFreshEvidenceGroundedAnswer({ text: second.text, input: args.input, sources: args.sources })
    }
  }

  // Owner-only excerpt of a rejected draft, so a rejection can be read instead of guessed. Never for unsafe
  // text: the draft itself is checked, because an unsafe draft without a cited sentence is rejected earlier
  // (no_evidence_cited / empty_answer) than the unsafe-output check.
  const rejectedDraftHead = accepted.ok || accepted.reason === 'unsafe_public_output' || hasUnsafePublicModelOutput(String(lastDraft || ''))
    ? undefined
    : String(lastDraft || '').replace(/\s+/g, ' ').trim().slice(0, 300)
  console.info('[cos-fresh-grounded-answer]', JSON.stringify({
    at: new Date().toISOString(),
    accepted: accepted.ok,
    reason: accepted.reason,
    repaired,
    citedSourceIds: accepted.citedSourceIds,
    sources: args.sources.length,
    latencyMs: Date.now() - startedAt,
    rejectedDraftHead,
  }))

  if (!accepted.ok) return { kind: 'citation_grounding_rejected', reason: accepted.reason ?? 'empty_answer', rejectedDraftHead }
  return {
    kind: 'accepted',
    reply: accepted.reply,
    reasonerLabel: label || resolveCosReasoner()?.config?.label || 'cos-reasoner',
    citedSourceIds: accepted.citedSourceIds,
  }
}
