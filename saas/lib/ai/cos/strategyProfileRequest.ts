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
//   3. BASELINE NEVER DISAPPEARS. Learned dimensions overlay the current Enterprise Memory
//      generation defaults. An empty learned profile means "use the baseline unchanged", never
//      "refuse to generate".
//
// Pure and dependency-free apart from the profile/default types.

import type { StrategyProfile } from './strategyProfile.ts'
import type { StrategyGenerationDefaults } from './strategyGenerationDefaults.ts'

export type StrategyProfileEvidenceView = StrategyProfile & {
  generationDefaults?: StrategyGenerationDefaults
  generationRule?: string
}

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

function shown(value: string | null | undefined): string {
  return String(value ?? '').trim() || 'not specified'
}

/**
 * Render the live generation view as evidence the reasoner can cite. Every learned recommendation
 * carries its campaign evidence, while the current non-learned baseline is rendered explicitly so
 * an empty profile cannot accidentally turn into a refusal.
 */
export function strategyProfileEvidenceBlock(profile: StrategyProfileEvidenceView): string {
  const defaults = profile.generationDefaults
  const baselineAvailable = defaults?.status === 'available'
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

  if (baselineAvailable && defaults) {
    lines.push('BASELINE GENERATION DEFAULTS — ACTIVE unless an evidence-qualified learned dimension overrides the corresponding choice.')
    lines.push(`  Goal: ${shown(defaults.goal)}`)
    lines.push(`  Tone: ${shown(defaults.tone)}`)
    lines.push(`  Format: ${shown(defaults.format)}`)
    lines.push(`  Offer type: ${shown(defaults.offerType)}`)
    lines.push(`  Platforms: ${defaults.platforms.length ? defaults.platforms.join(', ') : 'not specified'}`)
    lines.push(`  CTA strategy: ${shown(defaults.ctaStrategy)}`)
    if (defaults.audiences.length) lines.push(`  Audiences: ${defaults.audiences.join(', ')}`)
    if (defaults.industry) lines.push(`  Industry: ${defaults.industry}`)
    if (defaults.description) lines.push(`  Organization/product context: ${defaults.description}`)
    lines.push(`  Fallback rule: ${defaults.fallbackRule}`)
    if (profile.generationRule) lines.push(`  Generation rule: ${profile.generationRule}`)
    lines.push('')
  } else if (profile.generationRule) {
    lines.push(`GENERATION RULE: ${profile.generationRule}`)
    lines.push('')
  }

  lines.push('HOW TO USE THIS EVIDENCE:')

  if (profile.changesBehavior) {
    lines.push('1. GENERATE THE REQUESTED CONTENT. Start from the baseline defaults above when available, then overlay every dimension whose status is "learned".')
    lines.push('2. After the content, list each learned heuristic you applied and cite its evidence from above — the variant, its measured campaign count, and its margin. One line each.')
    lines.push('3. Do NOT apply a dimension whose status is "no_clear_winner" or "insufficient_evidence". Keep the corresponding baseline default when available; use ordinary judgement only when no baseline value exists.')
    lines.push('4. Do NOT invent numeric weights. The profile contains rates and margins, not weights; describe what it actually measured.')
  } else {
    lines.push('1. YOU MUST STILL PRODUCE THE REQUESTED CONTENT. An empty profile means there is no measured override; it is NOT a refusal condition.')
    lines.push(baselineAvailable
      ? '2. Write the content first using the BASELINE GENERATION DEFAULTS above unchanged. Zero learned overrides means the baseline remains the current strategy.'
      : '2. Write the content first using ordinary judgement and any organization context available because no baseline snapshot is available.')
    lines.push('3. After the content, add a short note that no measured heuristic overrode the baseline, and give the measured-campaign count / evidence threshold as the reason.')
    lines.push('4. Do NOT invent numeric weights, heuristics, or performance claims to fill the gap. Never answer this request only with an insufficient-data explanation.')
  }
  return lines.join('\n')
}
