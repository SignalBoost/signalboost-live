// saas/lib/ai/cos/freshEvidenceExternalSynthesis.ts
//
// Governed provider fallback for live-fact turns (reachable only when the owner enables external
// fallback). It runs the deterministic local-place resolver, then local COS, then — only if local
// COS could not produce a releasable answer — the SAME single-pass grounded prompt and the SAME
// acceptance on the governed hosted provider. A provider never gets a weaker (or different)
// release standard than COS; it only gets a different transport.
import { resolveLocalPlaceDiscovery } from '@/lib/ai/cos/cosLocalDiscovery'
import { synthesizeFreshEvidenceLocally } from '@/lib/ai/cos/freshEvidenceLocalSynthesis'
import {
  acceptFreshEvidenceGroundedAnswer,
  freshEvidenceGroundedAnswerPrompt,
  freshEvidenceGroundedRepairPrompt,
  FRESH_GROUNDED_ANSWER_MAX_TOKENS,
} from '@/lib/ai/cos/freshEvidenceGroundedAnswer'
import { CHAT_ANSWER_LENGTH_RULE } from '@/lib/ai/cos/cosFirstAnswerEnterprise'
import { callCosTextDetailed } from '@/lib/cos/textGateway'
import type { FreshEvidenceSource } from '@/lib/ai/cos/cosFreshGrounding'

export type FreshEvidenceExternalSynthesis = {
  attempted: true
  accepted: boolean
  reply: string | null
  provider: string | null
  model: string | null
  source: 'deterministic' | 'local' | 'provider' | 'cache' | null
}

export async function synthesizeFreshEvidenceExternally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceExternalSynthesis> {
  const rejected = (execution?: { provider?: string | null; model?: string | null; source?: 'provider' | 'cache' | null } | null): FreshEvidenceExternalSynthesis => ({
    attempted: true,
    accepted: false,
    reply: null,
    provider: execution?.provider ?? null,
    model: execution?.model ?? null,
    source: execution?.source ?? null,
  })

  if (!args.sources.length) return rejected()

  const deterministic = resolveLocalPlaceDiscovery(args.input, args.sources, args.language)
  if (deterministic) {
    return { attempted: true, accepted: true, reply: deterministic.reply, provider: null, model: null, source: 'deterministic' }
  }

  const local = await synthesizeFreshEvidenceLocally(args)
  if (local.kind === 'accepted') {
    return { attempted: true, accepted: true, reply: local.reply, provider: 'local', model: local.reasonerLabel, source: 'local' }
  }

  const first = freshEvidenceGroundedAnswerPrompt({ ...args, lengthRule: CHAT_ANSWER_LENGTH_RULE })
  let answered = await callCosTextDetailed({
    taskId: `cos-fresh-external-answer:${args.retrievedAt}`,
    prompt: first.prompt,
    systemPrompt: first.systemPrompt,
    modelPreference: 'gemini',
    maxTokens: FRESH_GROUNDED_ANSWER_MAX_TOKENS,
  }).catch(() => null)
  if (!answered?.text) return rejected(answered)

  let accepted = acceptFreshEvidenceGroundedAnswer({ text: answered.text, input: args.input, sources: args.sources })
  if (!accepted.ok && accepted.reason && accepted.reason !== 'unsafe_public_output') {
    const repair = freshEvidenceGroundedRepairPrompt({ ...args, lengthRule: CHAT_ANSWER_LENGTH_RULE, draft: accepted.answer, reason: accepted.reason })
    const repaired = await callCosTextDetailed({
      taskId: `cos-fresh-external-repair:${args.retrievedAt}`,
      prompt: repair.prompt,
      systemPrompt: repair.systemPrompt,
      modelPreference: 'gemini',
      maxTokens: FRESH_GROUNDED_ANSWER_MAX_TOKENS,
    }).catch(() => null)
    if (!repaired?.text) return rejected(repaired ?? answered)
    answered = repaired
    accepted = acceptFreshEvidenceGroundedAnswer({ text: repaired.text, input: args.input, sources: args.sources })
  }
  if (!accepted.ok) return rejected(answered)

  return {
    attempted: true,
    accepted: true,
    reply: accepted.reply,
    provider: answered.provider ?? null,
    model: answered.model ?? null,
    source: answered.source,
  }
}
