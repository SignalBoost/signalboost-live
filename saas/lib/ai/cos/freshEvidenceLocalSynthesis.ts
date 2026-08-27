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
  runFreshSynthesisTransportAttempts,
} from './freshEvidenceRetryPolicy.ts'

export type FreshEvidenceLocalSynthesis = {
  reply: string
  reasonerLabel: string
}

const MAX_TOKENS = 700
const TEMPERATURE = 0.1

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Try to answer a volatile/current-fact question from live evidence using bounded local synthesis.
 *
 * Production evidence on 2026-08-27 showed the live search completing successfully with eight
 * sources while a single DeepInfra completion stalled until the global 120s timeout. That transient
 * provider stall turned usable current evidence into a 503. Fresh synthesis therefore uses a much
 * shorter per-attempt timeout and retries one time locally under the exact same evidence-only
 * contract. No external provider or model-memory fallback is introduced.
 *
 * A completed model response that fails the evidence contract is NOT retried: that is a grounding
 * failure, not a transport failure, and must remain fail-closed.
 */
export async function synthesizeFreshEvidenceLocally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceLocalSynthesis | null> {
  if (!args.sources.length) return null

  const baseConfig = localInferenceConfigFromEnv()
  const attemptTimeoutMs = boundedFreshSynthesisAttemptTimeoutMs(baseConfig.timeoutMs)
  const prompt = freshEvidenceSynthesisPrompt(args)
  const systemPrompt = freshEvidenceSynthesisSystemPrompt(args.language)

  let text: string | null = null
  try {
    const result = await runFreshSynthesisTransportAttempts(
      () => callLocalModel({
        prompt,
        systemPrompt,
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }, {
        ...baseConfig,
        timeoutMs: attemptTimeoutMs,
      }),
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
    return null
  }

  if (!text?.trim()) return null

  const accepted = acceptFreshEvidenceSynthesis({ text, input: args.input, sources: args.sources })
  if (!accepted) return null
  const reasoner = resolveCosReasoner()
  return {
    reply: accepted.reply,
    reasonerLabel: reasoner.config?.label ?? `independent-local:${(process.env.LOCAL_AI_MODEL || 'local-model').trim()}`,
  }
}
