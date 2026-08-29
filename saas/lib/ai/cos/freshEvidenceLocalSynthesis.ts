// TIER 2 OF THE FRESHNESS LADDER — bounded local Qwen synthesis over this-turn live evidence.
// The model selects supporting evidence IDs; the server renders the exact URLs. This avoids
// rejecting a correct grounded answer merely because a local model copied a URL imperfectly.

import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'
import {
  acceptFreshEvidenceSynthesis,
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

const MAX_TOKENS = 700
const TEMPERATURE = 0.1

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Try to answer a volatile/current-fact question from live evidence using bounded local synthesis.
 *
 * Production evidence on 2026-08-27 showed the live search completing successfully with eight
 * sources while a single DeepInfra completion stalled until the global 120s timeout. A later live
 * run exposed that callLocalModel intentionally converts AbortError into null for compatibility,
 * which hid the timeout from the retry wrapper. This path therefore recognizes only a null that
 * consumed essentially the whole bounded attempt timeout as a retryable transport timeout.
 *
 * A fast null or a completed model response that fails the evidence contract is NOT retried: those
 * remain ordinary failure/grounding outcomes and must stay fail-closed. No external provider or
 * model-memory fallback is introduced.
 */
export async function synthesizeFreshEvidenceLocally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceLocalSynthesisOutcome> {
  if (!args.sources.length) return { kind: 'local_synthesis_unparseable' }

  const baseConfig = localInferenceConfigFromEnv()
  const attemptTimeoutMs = boundedFreshSynthesisAttemptTimeoutMs(baseConfig.timeoutMs)
  const prompt = freshEvidenceSynthesisPrompt(args)
  const systemPrompt = freshEvidenceSynthesisSystemPrompt(args.language)

  let text: string | null = null
  try {
    const result = await runFreshSynthesisTransportAttempts(
      async () => {
        const attemptStartedAt = Date.now()
        const value = await callLocalModel({
          prompt,
          systemPrompt,
          maxTokens: MAX_TOKENS,
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
          attempt,
          nextAttempt,
          attemptTimeoutMs,
          reason: errorText(error),
        }))
      },
    )
    text = result.value
  } catch (error) {
    console.warn('[cos-fresh-local-synthesis] failed closed after bounded local retry', JSON.stringify({
      at: new Date().toISOString(),
      attemptTimeoutMs,
      reason: errorText(error),
    }))
    return { kind: 'local_synthesis_failed', error: errorText(error) }
  }

  if (!text?.trim()) return { kind: 'local_synthesis_unparseable' }

  const accepted = acceptFreshEvidenceSynthesis({ text, input: args.input, sources: args.sources })
  if (!accepted) return { kind: 'citation_grounding_rejected' }
  const reasoner = resolveCosReasoner()
  return {
    kind: 'accepted',
    reply: accepted.reply,
    reasonerLabel: reasoner.config?.label ?? `independent-local:${(process.env.LOCAL_AI_MODEL || 'local-model').trim()}`,
  }
}
