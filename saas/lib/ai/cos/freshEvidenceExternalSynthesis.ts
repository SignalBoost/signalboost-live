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
  source: 'provider' | 'cache' | null
}

export async function synthesizeFreshEvidenceExternally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceExternalSynthesis> {
  if (!args.sources.length) {
    return { attempted: true, accepted: false, reply: null, provider: null, model: null, source: null }
  }

  const result = await callCosTextDetailed({
    // retrievedAt makes the gateway identity request-specific, preventing cross-request replay of
    // a volatile answer while still preserving the normal COS gateway/provider boundary.
    taskId: `cos-fresh-external:${args.retrievedAt}`,
    prompt: freshEvidenceSynthesisPrompt(args),
    systemPrompt: freshEvidenceSynthesisSystemPrompt(args.language),
    // Fresh/current facts are evidence-synthesis tasks, not local-memory reasoning tasks.
    // Prefer Gemini only after COS has already retrieved and authority-checked live evidence.
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
