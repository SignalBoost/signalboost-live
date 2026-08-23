// A fast, model-free generation path for the common "use the current strategy profile" request.
//
// The production chat UI is bounded by the concierge request budget. A strategy-profile request
// already has everything needed to produce a truthful baseline artifact: the current Enterprise
// Intelligence defaults plus any evidence-qualified campaign overrides. Sending that request
// through the entire general reasoning stack can spend the full request budget and return a timeout
// even though the strategy data itself was available immediately. This module renders the artifact
// directly from the system of record, preserving the same evidence rules without a model call.

import {
  appliedStrategyOverrides,
  MINIMUM_APPROVED_FOR_REWORK_RATE,
  MINIMUM_CAMPAIGNS_PER_VARIANT,
  MINIMUM_RELATIVE_MARGIN,
  type StrategyProfile,
} from './strategyProfile.ts'
import type { StrategyGenerationDefaults } from './strategyGenerationDefaults.ts'

export type DirectStrategyGenerationView = StrategyProfile & {
  generationDefaults?: StrategyGenerationDefaults
  generationRule?: string
}

function clean(value: unknown, max = 900): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function list(values: string[]): string {
  return values.filter(Boolean).join(', ')
}

/** Keep the fast path narrow: it is for generation, not ordinary strategy discussion/reporting. */
export function isDirectStrategyGenerationRequest(input: string): boolean {
  const text = clean(input, 700)
  if (!text) return false
  const generation = /\b(?:generate|create|write|draft|produce)\b/i.test(text)
  const profile = /\b(?:strategy\s+profile|strategy\s+weights?|profile\s+weights?)\b/i.test(text)
  return generation && profile
}

function explicitSubject(input: string): string {
  const text = clean(input, 700)
  const match = text.match(/\b(?:about|for|on)\s+(.+?)(?=\s+(?:using|with|based\s+on)\s+(?:the\s+)?(?:current\s+)?strategy|\s+and\s+explain\b|$)/i)
  return clean(match?.[1], 300)
}

function fallbackSubject(defaults: StrategyGenerationDefaults | undefined): string {
  return clean(defaults?.description, 600) || 'the organization and its current offer'
}

function landingPageArtifact(args: {
  subject: string
  defaults?: StrategyGenerationDefaults
  cta: string
  creative: string | null
  channel: string | null
}): string[] {
  const { subject, defaults, cta, creative, channel } = args
  const audiences = defaults?.audiences?.length ? `Designed for ${list(defaults.audiences)}.` : ''
  const platforms = defaults?.platforms?.length ? list(defaults.platforms) : ''
  const distribution = channel || platforms
  const offer = clean(defaults?.offerType) || 'Educational Resource'

  return [
    '## Generated Content',
    '',
    '# Build a Clearer, More Scalable Content Presence',
    '',
    subject,
    '',
    '### Turn one clear message into useful, consistent content',
    '',
    'Create a structured digital presence that explains the value clearly, teaches the audience what matters, and gives them a concrete next step. Keep the message technically precise, easy to verify, and consistent across every published surface.',
    '',
    '### Make the content useful before asking for action',
    '',
    'Lead with education: define the problem, explain the practical approach, show how the solution fits the audience’s workflow, and make the next step specific. The objective is informed action rather than generic promotion.',
    '',
    audiences,
    distribution ? `Primary publishing surfaces: ${distribution}.` : '',
    creative ? `Creative direction: ${creative}.` : '',
    '',
    `### ${offer}`,
    '',
    'Use the resource to turn the core message into a repeatable structure for website, video, review, audio, and related content while preserving a consistent technical narrative.',
    '',
    `**${cta}**`,
  ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== ''))
}

/**
 * Render an actual artifact first, then explain exactly which baseline choices and learned evidence
 * influenced it. There are no invented numeric "weights": the learner exposes categorical winners,
 * measured counts and margins.
 */
export function renderDirectStrategyGeneration(input: string, profile: DirectStrategyGenerationView): string {
  const defaults = profile.generationDefaults
  const overrides = appliedStrategyOverrides(profile)
  const subject = explicitSubject(input) || fallbackSubject(defaults)
  const cta = clean(overrides.cta) || clean(defaults?.ctaStrategy) || 'Learn More'
  const creative = clean(overrides.creative) || null
  const channel = clean(overrides.channel) || null
  const format = clean(defaults?.format) || 'Content'
  const artifact = /landing\s*page/i.test(format)
    ? landingPageArtifact({ subject, defaults, cta, creative, channel })
    : [
        '## Generated Content',
        '',
        subject,
        '',
        'Explain the value clearly, teach the audience the practical mechanism, and finish with a concrete next step.',
        '',
        `**${cta}**`,
      ]

  const learned = profile.dimensions.filter(dimension => dimension.status === 'learned' && dimension.recommended)
  const baselineLines = defaults?.status === 'available'
    ? [
        `- Goal: ${clean(defaults.goal) || 'not specified'}`,
        `- Tone: ${clean(defaults.tone) || 'not specified'}`,
        `- Format: ${clean(defaults.format) || 'not specified'}`,
        `- Offer type: ${clean(defaults.offerType) || 'not specified'}`,
        `- Platforms: ${defaults.platforms.length ? list(defaults.platforms) : 'not specified'}`,
        `- CTA strategy: ${clean(defaults.ctaStrategy) || 'not specified'}`,
        `- Audiences: ${defaults.audiences.length ? list(defaults.audiences) : 'not specified'}`,
        `- Industry: ${clean(defaults.industry) || 'not specified'}`,
      ]
    : ['- No Enterprise Intelligence baseline snapshot was available; ordinary deterministic defaults were used.']

  const learnedLines = learned.length
    ? learned.map(dimension => {
        const winner = dimension.variants.find(variant => variant.variant === dimension.recommended)
        const runnerUp = dimension.variants.find(variant => variant.variant !== dimension.recommended)
        const margin = dimension.relativeMargin == null ? 'not computable' : `${(dimension.relativeMargin * 100).toFixed(1)}%`
        return `- Learned ${dimension.dimension}: ${dimension.recommended} — ${winner?.measuredCampaigns ?? 0} measured campaigns; margin over runner-up ${margin}${runnerUp ? `; runner-up ${runnerUp.variant}` : ''}.`
      })
    : [`- No learned campaign heuristic overrode the baseline. The profile currently has ${profile.measuredCampaigns} measured campaign${profile.measuredCampaigns === 1 ? '' : 's'}.`]

  return [
    ...artifact,
    '',
    '## Strategy Applied',
    '',
    ...baselineLines,
    '',
    '## Heuristics Influencing the Output',
    '',
    ...learnedLines,
    `- Evidence gate: a variant needs at least ${MINIMUM_CAMPAIGNS_PER_VARIANT} measured campaigns before it can compete for a learned recommendation.`,
    `- Winner gate: the leading variant must beat the runner-up by at least ${(MINIMUM_RELATIVE_MARGIN * 100).toFixed(0)}% before COS changes the baseline.`,
    `- Rework gate: approval/edit behavior is treated as a learned signal only after at least ${MINIMUM_APPROVED_FOR_REWORK_RATE} approved campaigns.`,
    explicitSubject(input)
      ? '- Subject selection: the topic supplied in the request was used as the content subject.'
      : '- Subject selection: no topic was supplied, so the current Enterprise Intelligence organization/product description was used as the subject.',
    '- Weight semantics: the current implementation does not store opaque numeric strategy weights. It derives auditable categorical overrides from measured outcomes; all non-learned dimensions keep the baseline defaults.',
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
