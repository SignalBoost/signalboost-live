// saas/lib/ai/cos/strategyProfileRequest.ts
//
// WIRE THE DERIVED STRATEGY PROFILE INTO ANSWERS THAT ASK FOR IT.
//
// SignalBoost derives a strategy profile from real campaign outcomes (strategyProfile.ts computes
// the winning channel / CTA / creative, with sample-size and margin minimums so a lucky campaign
// cannot win) and exposes it through one reader (strategyProfileReport.ts) and an owner endpoint.
// Nothing in the answer path ever called it. So "generate content using the current strategy
// profile weights" retrieved generic organization memory, found no weights, and correctly reported
// that the parameters were missing — a disconnection, not a reasoning failure (2026-08-23).
//
// Three rules this module encodes:
//
//   1. CACHE IS INVALID FOR THESE REQUESTS. A profile changes whenever a campaign reports results,
//      so a cached answer is stale by construction. Detected requests bypass both cache layers.
//   2. EVIDENCE, NOT ASSERTION. Each recommendation is rendered with the campaigns behind it —
//      variant, measured campaign count, CTR, margin over the runner-up. The answer contract
//      requires citing that evidence per heuristic and forbids inventing weights.
//   3. HONEST EMPTINESS. When no dimension reached 'learned', the block says so plainly and
//      instructs the reasoner to generate from its ordinary judgement while stating that the
//      profile taught nothing yet. "Not enough campaigns" is a real answer; fabricated weights
//      are not.
//
// Pure and dependency-free apart from the profile types.

import type { StrategyProfile } from './strategyProfile'

const B0 = '(?<![\\p{L}\\p{M}])'
const B1 = '(?![\\p{L}\\p{M}])'
const bounded = (alternatives: string) => new RegExp(`${B0}(?:${alternatives})${B1}`, 'iu')

/** The learned-performance object being referred to. */
const PROFILE_SUBJECT = bounded([
  'strategy\\s+profile|strategy\\s+weights|profile\\s+weights|learned\\s+performance|performance\\s+profile|winning\\s+(?:channel|cta|creative)|best\\s+performing|heuristics?',
  'perfil\\s+de\\s+estrategia|pesos\\s+de\\s+estrategia|rendimiento\\s+aprendido|heur[ií]sticas?',
  'perfil\\s+de\\s+estrat[ée]gia|pesos\\s+da\\s+estrat[ée]gia|desempenho\\s+aprendido|heur[ií]sticas?',
  'profil\\p{L}*\\s+strategii|wagi\\s+strategii|wyuczon\\p{L}*\\s+skuteczno[śs][ćc]\\p{L}*|heurystyk\\p{L}*',
  'профил\\p{L}*\\s+стратегии|вес\\p{L}*\\s+стратегии|извлечённ\\p{L}*\\s+эффективност\\p{L}*|эвристик\\p{L}*',
].join('|'))

/** Asking COS to USE it (generate/apply), or to REPORT it. Both need the live profile. */
const PROFILE_INTENT = bounded([
  'generate|create|write|draft|produce|apply|use|using|based\\s+on|explain|show|which|what',
  'genera|crea|escribe|aplica|usa|usando|explica|muestra',
  'gere|crie|escreva|aplique|use|usando|explique|mostre',
  'wygeneruj|stw[oó]rz|napisz|zastosuj|u[zż]yj|wyja[śs]nij|poka[zż]',
  'сгенерируй|создай|напиши|примени|используй|объясни|покажи',
].join('|'))

/**
 * True when the answer must be built from the live derived strategy profile. Requires BOTH the
 * subject and an intent to use or explain it, so "our strategy is to expand into Europe" — an
 * ordinary business statement — does not trigger a profile read.
 */
export function isStrategyProfileRequest(input: string): boolean {
  const text = String(input || '').trim()
  if (!text || text.length > 600) return false
  return PROFILE_SUBJECT.test(text) && PROFILE_INTENT.test(text)
}

function percent(value: number | null): string {
  return value === null ? 'not measurable' : `${(value * 100).toFixed(1)}%`
}

/**
 * Render the profile as evidence the reasoner can cite. Every recommendation carries its campaign
 * count, click-through rate and margin; nothing is stated that the derivation did not compute.
 */
export function strategyProfileEvidenceBlock(profile: StrategyProfile): string {
  const lines: string[] = [
    'CURRENT STRATEGY PROFILE — derived from this organization\'s measured campaign outcomes, read live for this request.',
    `Generated: ${profile.generatedAt}`,
    `Campaigns: ${profile.totalCampaigns} total, ${profile.measuredCampaigns} measured, ${profile.unmeasuredCampaigns} not yet measurable.`,
    `Summary: ${profile.summary}`,
    '',
  ]

  for (const dimension of profile.dimensions) {
    lines.push(`DIMENSION ${dimension.dimension.toUpperCase()} — status ${dimension.status}${dimension.recommended ? `; recommended "${dimension.recommended}"` : ''}`)
    lines.push(`  Why: ${dimension.reason}`)
    if (dimension.relativeMargin !== null) lines.push(`  Margin over runner-up: ${(dimension.relativeMargin * 100).toFixed(1)}%`)
    for (const variant of dimension.variants.slice(0, 6)) {
      lines.push(`  · "${variant.variant}" — ${variant.measuredCampaigns} measured campaigns; CTR ${percent(variant.clickThroughRate)}; avg score ${variant.averagePerformanceScore.toFixed(2)}; ${variant.impressions} impressions, ${variant.clicks} clicks`)
    }
  }

  lines.push('')
  lines.push(`REWORK SIGNAL — status ${profile.rework.status}; ${profile.rework.approvedCampaigns} approved campaigns, ${profile.rework.campaignsRequiringEdits} required edits.`)
  lines.push('')
  // NOTE ON WHERE BEHAVIORAL RULES LIVE: this block is retrieved EVIDENCE, and COS is designed to
  // treat evidence as data rather than as instructions — correctly, since that is what stops
  // prompt injection through a retrieved document. So the lines below are descriptive guidance
  // about the data, not the enforcement mechanism. The rule that COS must still produce the
  // requested artifact when the profile is empty lives in the trusted system prompt
  // (COS_REASONER_SYSTEM_PROMPT, 'MISSING EVIDENCE IS NOT A REASON TO PRODUCE NOTHING'), because a
  // behavioral instruction placed here was ignored in production on 2026-08-23 — as it should be.
  lines.push('HOW TO USE THIS EVIDENCE:')

  if (profile.changesBehavior) {
    lines.push('1. Generate the requested content, applying every dimension whose status is "learned".')
    lines.push('2. After the content, list each heuristic you applied and cite its evidence from above — the variant, its measured campaign count, and its margin. One line each.')
    lines.push('3. Do NOT apply a dimension whose status is "no_clear_winner" or "insufficient_evidence"; use your ordinary judgement there and say so.')
    lines.push('4. Do NOT invent numeric weights. The profile contains rates and margins, not weights; describe what it actually measured.')
  } else {
    lines.push('1. YOU MUST STILL PRODUCE THE REQUESTED CONTENT. An empty profile is a reason the content is not yet performance-tuned; it is NOT a reason to refuse. Refusing leaves the user with nothing, which is worse than unoptimized content.')
    lines.push('2. Write the content first, using ordinary judgement and any organization context available.')
    lines.push('3. After the content, add a short note: the strategy profile did not influence it, and why — give the measured-campaign count and the minimum required from the evidence above.')
    lines.push('4. Do NOT invent weights, heuristics, or performance claims to fill the gap, and do NOT present ordinary judgement as learned performance.')
  }
  return lines.join('\n')
}
