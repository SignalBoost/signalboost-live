import { resolveLocalPlaceDiscovery } from '@/lib/ai/cos/cosLocalDiscovery'
import { synthesizeFreshEvidenceLocally } from '@/lib/ai/cos/freshEvidenceLocalSynthesis'
import { callCosTextDetailed } from '@/lib/cos/textGateway'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'
import {
  acceptFreshEvidenceSemanticPlan,
  acceptFreshEvidenceSynthesis,
  freshEvidenceScopePlanPrompt,
  freshEvidenceScopePlanSystemPrompt,
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
 * Compatibility name retained for callers. Every model path uses the same semantic contract:
 * scope planning first, answer synthesis second. A hosted provider remains only the final governed
 * fallback after COS-owned local synthesis fails; it cannot bypass the semantic/evidence validator.
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

  const planned = await callCosTextDetailed({
    taskId: `cos-fresh-external-scope:${args.retrievedAt}`,
    prompt: freshEvidenceScopePlanPrompt(args),
    systemPrompt: freshEvidenceScopePlanSystemPrompt(args.language),
    modelPreference: 'gemini',
    maxTokens: 500,
  }).catch(() => null)

  if (!planned?.text) {
    return { attempted: true, accepted: false, reply: null, provider: planned?.provider ?? null, model: planned?.model ?? null, source: planned?.source ?? null }
  }

  const semanticPlan = acceptFreshEvidenceSemanticPlan({ text: planned.text, sources: args.sources })
  if (!semanticPlan) {
    return { attempted: true, accepted: false, reply: null, provider: planned.provider ?? null, model: planned.model ?? null, source: planned.source }
  }

  const answered = await callCosTextDetailed({
    taskId: `cos-fresh-external-answer:${args.retrievedAt}`,
    prompt: freshEvidenceSynthesisPrompt({ ...args, semanticPlan }),
    systemPrompt: freshEvidenceSynthesisSystemPrompt(args.language),
    modelPreference: 'gemini',
    maxTokens: 700,
  }).catch(() => null)

  if (!answered?.text) {
    return { attempted: true, accepted: false, reply: null, provider: answered?.provider ?? planned.provider ?? null, model: answered?.model ?? planned.model ?? null, source: answered?.source ?? planned.source ?? null }
  }

  const accepted = acceptFreshEvidenceSynthesis({
    text: answered.text,
    input: args.input,
    sources: args.sources,
    semanticPlan,
  })
  return {
    attempted: true,
    accepted: Boolean(accepted),
    reply: accepted?.reply ?? null,
    provider: answered.provider ?? null,
    model: answered.model ?? null,
    source: answered.source,
  }
}
