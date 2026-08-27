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

export type FreshEvidenceLocalSynthesis = {
  reply: string
  reasonerLabel: string
}

const MAX_TOKENS = 700
const TEMPERATURE = 0.1
const MAX_ATTEMPTS = 2
const DEFAULT_ATTEMPT_TIMEOUT_MS = 35_000
const MIN_ATTEMPT_TIMEOUT_MS = 5_000
const MAX_ATTEMPT_TIMEOUT_MS = 60_000

function freshAttemptTimeoutMs(): number {
  const configured = Number(process.env.COS_FRESH_LOCAL_SYNTHESIS_TIMEOUT_MS || DEFAULT_ATTEMPT_TIMEOUT_MS)
  if (!Number.isFinite(configured)) return DEFAULT_ATTEMPT_TIMEOUT_MS
  return Math.max(MIN_ATTEMPT_TIMEOUT_MS, Math.min(MAX_ATTEMPT_TIMEOUT_MS, configured))
}

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
  const attemptTimeoutMs = Math.min(baseConfig.timeoutMs, freshAttemptTimeoutMs())
  const prompt = freshEvidenceSynthesisPrompt(args)
  const systemPrompt = freshEvidenceSynthesisSystemPrompt(args.language)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let text: string | null = null
    try {
      text = await callLocalModel({
        prompt,
        systemPrompt,
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }, {
        ...baseConfig,
        timeoutMs: attemptTimeoutMs,
      })
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        console.warn('[cos-fresh-local-synthesis-retry]', JSON.stringify({
          at: new Date().toISOString(),
          attempt,
          nextAttempt: attempt + 1,
          attemptTimeoutMs,
          reason: errorText(error),
        }))
        continue
      }
      console.warn('[cos-fresh-local-synthesis] failed closed after bounded local retry', JSON.stringify({
        at: new Date().toISOString(),
        attempts: MAX_ATTEMPTS,
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

  return null
}
