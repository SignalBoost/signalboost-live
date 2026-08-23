// Pure extraction of the current non-learned generation defaults from Enterprise Memory.
// Learned campaign outcomes overlay these defaults; an empty learned profile never disables them.

export type StrategyGenerationDefaults = {
  status: 'available' | 'unavailable'
  source: 'enterprise_intelligence_snapshot'
  workspace: string | null
  analyzedAt: string | null
  description: string
  goal: string
  tone: string
  format: string
  offerType: string
  platforms: string[]
  ctaStrategy: string
  audiences: string[]
  industry: string
  creativeSuggestions: string[]
  fallbackRule: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function clean(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function strings(value: unknown, limit = 8): string[] {
  return Array.isArray(value) ? value.map(item => clean(item, 160)).filter(Boolean).slice(0, limit) : []
}

export function strategyGenerationDefaultsFromSnapshot(args: {
  snapshot: unknown
  workspace?: unknown
  analyzedAt?: unknown
}): StrategyGenerationDefaults {
  const snapshot = record(args.snapshot)
  const plan = record(snapshot.campaignPlan)
  const classification = record(snapshot.classification)
  const suggestions = Array.isArray(snapshot.creativeSuggestions) ? snapshot.creativeSuggestions : []
  const creativeSuggestions = suggestions.map(item => {
    const row = record(item)
    const title = clean(row.title, 160)
    const description = clean(row.description, 360)
    return [title, description].filter(Boolean).join(' — ')
  }).filter(Boolean).slice(0, 6)

  const defaults: StrategyGenerationDefaults = {
    status: 'available',
    source: 'enterprise_intelligence_snapshot',
    workspace: clean(args.workspace, 120) || null,
    analyzedAt: clean(args.analyzedAt, 80) || null,
    description: clean(snapshot.description),
    goal: clean(plan.goal, 160),
    tone: clean(plan.tone, 160),
    format: clean(plan.format, 160),
    offerType: clean(plan.offerType, 160),
    platforms: strings(plan.platforms),
    ctaStrategy: clean(plan.ctaStrategy, 200),
    audiences: strings(classification.audiences),
    industry: clean(classification.industry, 200),
    creativeSuggestions,
    fallbackRule: 'Apply learned strategy overrides only where the measured profile has status learned. For every other dimension, keep these baseline defaults. Empty learned overrides are NOT a refusal condition: generate the requested content using these defaults and then explain that measured outcomes did not change them.',
  }

  const hasUsableDefault = Boolean(
    defaults.description || defaults.goal || defaults.tone || defaults.format || defaults.offerType ||
    defaults.platforms.length || defaults.ctaStrategy || defaults.audiences.length || defaults.industry || defaults.creativeSuggestions.length,
  )
  return hasUsableDefault ? defaults : { ...defaults, status: 'unavailable' }
}
