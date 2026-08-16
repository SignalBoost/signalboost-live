// saas/lib/ai/cos/freshEvidenceLocalSynthesis.ts
//
// TIER 2 OF THE GROUNDING LADDER — local Qwen synthesizes volatile-fact answers from live
// evidence BEFORE any external model is consulted.
//
// The ladder (owner-defined):
//   1. Direct authoritative fact  → deterministic, no model            [live]
//   2. Several live sources        → LOCAL Qwen, sources-only          [THIS MODULE]
//   3. Local unavailable/uncited   → Gemini as constrained phraser     [existing route path]
//   4. No trustworthy source       → fail closed                       [existing route path]
//
// Until now the route jumped from tier 1 straight to tier 3: searched evidence was handed to
// Gemini for synthesis. That works but spends external quota and sends the question off-box for
// no reason — the evidence is already fetched; phrasing it is exactly what the local reasoner is
// for. This module gives the evidence to Qwen with a hard sources-only contract and accepts the
// answer ONLY when it actually cites the provided sources (same replyCitesFreshEvidence gate the
// Gemini path must pass). Any failure — reasoner cold, empty reply, uncited reply — returns null
// and the route falls through to tier 3 unchanged, so this is strictly additive: local when
// possible, Gemini only when local genuinely cannot.
//
// Deliberately calls callLocalModel directly, NOT callCosReasoner: the Council fan-out
// (SRE+Architect+Skeptic, ~3 sequential 32B calls) exists for open diagnostic reasoning and is
// the known ~233s latency driver. Phrasing already-fetched evidence needs one bounded call.

import { callLocalModel } from '@/lib/ai/local-inference'
import {
  freshEvidenceGroundingBlock,
  replyCitesFreshEvidence,
  type FreshEvidenceSource,
} from '@/lib/ai/cos/cosFreshGrounding'

export type FreshEvidenceLocalSynthesis = {
  reply: string
  reasonerLabel: string
}

const MAX_TOKENS = 700 // grounded factual replies are short; a cap keeps tier 2 fast and cheap
const TEMPERATURE = 0.1 // phrasing evidence, not ideating

function synthesisSystemPrompt(language: string): string {
  return [
    `Answer in ${language}.`,
    'You are summarizing LIVE EVIDENCE retrieved moments ago. The evidence block is your ONLY permitted source of facts.',
    'Rules, in order of priority:',
    '1. Use ONLY facts present in the evidence block. Your own memory is assumed stale for this question and must not contribute facts.',
    '2. Cite every factual claim inline with the evidence label and URL, e.g. "... [LIVE1] (https://example.gov/page)".',
    '3. If the evidence does not actually answer the question, reply with exactly: EVIDENCE_INSUFFICIENT',
    '4. Be brief: one to three sentences, then the citation(s). No preamble, no caveats about being an AI.',
  ].join('\n')
}

/**
 * Try to answer a volatile-fact question locally from already-fetched live evidence.
 * Returns null whenever the answer cannot be honestly produced locally — reasoner unreachable,
 * empty output, model declared the evidence insufficient, or the reply failed the citation gate —
 * so the caller's existing tier-3 (constrained external) path takes over.
 */
export async function synthesizeFreshEvidenceLocally(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  language: string
}): Promise<FreshEvidenceLocalSynthesis | null> {
  if (!args.sources.length) return null
  try {
    const evidenceBlock = freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)
    const text = await callLocalModel({
      prompt: `${evidenceBlock}\n\nQUESTION: ${args.input}`,
      systemPrompt: synthesisSystemPrompt(args.language),
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    })
    const reply = (text || '').trim()
    if (!reply) return null
    if (/EVIDENCE_INSUFFICIENT/i.test(reply)) return null // honest local verdict: sources don't answer it
    if (!replyCitesFreshEvidence(reply, args.sources)) return null // uncited synthesis is not accepted from ANY model
    return {
      reply,
      reasonerLabel: `independent-local:${(process.env.LOCAL_AI_MODEL || '').trim()}`,
    }
  } catch (error) {
    console.warn('[cos-fresh-local-synthesis] failed closed; tier-3 external path will handle it', error instanceof Error ? error.message : String(error))
    return null
  }
}
