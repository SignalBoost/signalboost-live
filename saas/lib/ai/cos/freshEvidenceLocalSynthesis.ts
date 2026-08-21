// TIER 2 OF THE FRESHNESS LADDER — one bounded local Qwen call over this-turn live evidence.
// The model selects supporting evidence IDs; the server renders the exact URLs. This avoids
// rejecting a correct grounded answer merely because a local model copied a URL imperfectly.

import { callLocalModel } from '@/lib/ai/local-inference'
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

/**
 * Try to answer a volatile/current-fact question from live evidence using exactly one local model
 * call. Returns null when local inference is unavailable, the evidence is insufficient, the output
 * is malformed, or the model does not select the independent evidence required by policy.
 */
export async function synthesizeFreshEvidenceLocally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceLocalSynthesis | null> {
  if (!args.sources.length) return null
  try {
    const text = await callLocalModel({
      prompt: freshEvidenceSynthesisPrompt(args),
      systemPrompt: freshEvidenceSynthesisSystemPrompt(args.language),
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    })
    if (!text?.trim()) return null

    const accepted = acceptFreshEvidenceSynthesis({ text, input: args.input, sources: args.sources })
    if (!accepted) return null
    const reasoner = resolveCosReasoner()
    return {
      reply: accepted.reply,
      reasonerLabel: reasoner.config?.label ?? `independent-local:${(process.env.LOCAL_AI_MODEL || 'local-model').trim()}`,
    }
  } catch (error) {
    console.warn('[cos-fresh-local-synthesis] failed closed; direct external fresh-synthesis fallback may handle it', error instanceof Error ? error.message : String(error))
    return null
  }
}
