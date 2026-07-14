export type StructuredCampaignBrief = {
  sourceUrl: string
  goal: string
  audiences: string[]
  tone: string
  region: string
  platforms: string[]
  format: string
  offerType: string
  ctaStrategy: string
  suggestionTitle?: string
  suggestionDescription?: string
}

function list(values: string[]): string {
  return values.filter(Boolean).join(', ')
}

export function buildCampaignDirective(brief: StructuredCampaignBrief): string {
  const parts = [
    `Use source: ${brief.sourceUrl}.`,
    `Goal: ${brief.goal}.`,
    `Audience: ${list(brief.audiences)}.`,
    `Tone: ${brief.tone}.`,
    `Region: ${brief.region}.`,
    `Platforms: ${list(brief.platforms)}.`,
    `Format: ${brief.format}.`,
    `Offer: ${brief.offerType}.`,
    `CTA: ${brief.ctaStrategy}.`,
  ]

  if (brief.suggestionTitle) parts.push(`Creative concept: ${brief.suggestionTitle}.`)
  if (brief.suggestionDescription) parts.push(`Direction: ${brief.suggestionDescription}.`)

  return parts.join(' ')
}

export function isCampaignBriefComplete(brief: StructuredCampaignBrief): boolean {
  return Boolean(
    brief.sourceUrl &&
    brief.goal &&
    brief.audiences.length &&
    brief.tone &&
    brief.region &&
    brief.platforms.length &&
    brief.format &&
    brief.offerType &&
    brief.ctaStrategy
  )
}
