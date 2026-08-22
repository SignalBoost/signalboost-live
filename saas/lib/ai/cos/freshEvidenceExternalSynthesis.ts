import { callCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { resolveLocalPlaceDiscovery } from '@/lib/ai/cos/cosLocalDiscovery'
import { callCosTextDetailed } from '@/lib/cos/textGateway'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'
import {
  acceptFreshEvidenceSynthesis,
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
 * Compatibility name retained for callers, but fresh-evidence synthesis is now COS-first:
 * 1. deterministic local-place discovery when live search already contains the answer;
 * 2. independent COS reasoner constrained to the server-retrieved evidence block;
 * 3. governed external text provider only as a final permitted fallback.
 *
 * This prevents the fresh-data path from depending on hosted external AI while preserving the
 * fail-closed evidence contract: no model may use its own memory to fill a missing current fact.
 */
export async function synthesizeFreshEvidenceExternally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceExternalSynthesis> {
  if (!args.sources.length) {
    return { attempted: true, accepted: false, reply: null, provider: null, model: null, source: null }
  }

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

  const prompt = freshEvidenceSynthesisPrompt(args)
  const systemPrompt = freshEvidenceSynthesisSystemPrompt(args.language)

  // Fresh facts do not require an external model. COS may synthesize from the live evidence block
  // as long as the same strict JSON/citation contract accepts the result.
  const local = await callCosReasoner({
    temperature: 0,
    maxTokens: 700,
    systemPrompt,
    prompt,
  }).catch(() => null)

  if (local?.text) {
    const accepted = acceptFreshEvidenceSynthesis({ text: local.text, input: args.input, sources: args.sources })
    if (accepted) {
      return {
        attempted: true,
        accepted: true,
        reply: accepted.reply,
        provider: 'local',
        model: local.reasoner.label,
        source: 'local',
      }
    }
  }

  const result = await callCosTextDetailed({
    // retrievedAt makes the gateway identity request-specific, preventing cross-request replay of
    // a volatile answer while still preserving the normal COS gateway/provider boundary.
    taskId: `cos-fresh-external:${args.retrievedAt}`,
    prompt,
    systemPrompt,
    // External AI remains only a governed fallback after COS-owned evidence synthesis fails.
    modelPreference: 'gemini',
    maxTokens: 700,
  }).catch(() => null)

  if (!result?.text) {
    return { attempted: true, accepted: false, reply: null, provider: result?.provider ?? null, model: result?.model ?? null, source: result?.source ?? null }
  }

  const accepted = acceptFreshEvidenceSynthesis({ text: result.text, input: args.input, sources: args.sources })
  return {
    attempted: true,
    accepted: Boolean(accepted),
    reply: accepted?.reply ?? null,
    provider: result.provider ?? null,
    model: result.model ?? null,
    source: result.source,
  }
}
