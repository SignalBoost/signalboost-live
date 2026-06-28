import type { ExternalSignalIngestionResult, ExternalSignalInput, NormalizedExternalSignal } from './types'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function confidenceFor(input: ExternalSignalInput) {
  const c = Number(input.confidence)
  if (Number.isFinite(c)) return Math.max(0, Math.min(100, Math.round(c)))
  if (input.source_type === 'campaign_log') return 76
  if (input.source_type === 'field_benchmark') return 68
  if (input.source_type === 'public_dataset') return 64
  if (input.source_type === 'web_research') return 58
  return 52
}

export function normalizeExternalSignal(input: ExternalSignalInput): NormalizedExternalSignal {
  const normalizedAt = new Date().toISOString()
  const source = `${input.source_type}:${input.source_name}`
  const views = safeNumber(input.views)
  const clicks = safeNumber(input.clicks)
  const conversions = safeNumber(input.conversions)
  const watchSeconds = safeNumber(input.watch_seconds)

  return {
    ...input,
    views,
    clicks,
    conversions,
    watch_seconds: watchSeconds,
    confidence: confidenceFor(input),
    id: id('external_signal'),
    normalized_at: normalizedAt,
    marketing_signal: {
      source,
      audience: input.audience,
      region: input.region,
      product: input.product,
      format: input.observed_format,
      hero: input.observed_hero,
      views,
      clicks,
      conversions,
      watch_seconds: watchSeconds,
      confidence: confidenceFor(input),
      notes: [
        ...(input.source_url ? [`source_url=${input.source_url}`] : []),
        ...(input.notes || []),
      ],
    },
  }
}

export function ingestExternalSignals(inputs: ExternalSignalInput[] = []): ExternalSignalIngestionResult {
  const signals = inputs
    .filter(input => input && input.source_type && input.source_name)
    .map(normalizeExternalSignal)

  const totalViews = signals.reduce((sum, signal) => sum + (signal.views || 0), 0)
  const totalClicks = signals.reduce((sum, signal) => sum + (signal.clicks || 0), 0)
  const totalConversions = signals.reduce((sum, signal) => sum + (signal.conversions || 0), 0)

  return {
    ok: true,
    signals,
    marketing_signals: signals.map(signal => signal.marketing_signal),
    summary: signals.length
      ? [
          `Normalized ${signals.length} external signal(s).`,
          `Aggregates: ${totalViews} views, ${totalClicks} clicks, ${totalConversions} conversions.`,
          'Signals are now ready for COSA marketing scoring and prediction.',
        ]
      : [
          'No external signals were provided.',
          'COSA will use starter assumptions until web research, public datasets, or campaign logs are ingested.',
        ],
  }
}

export function starterExternalSignals(): ExternalSignalInput[] {
  return [
    {
      source_type: 'manual_observation',
      source_name: 'starter_short_video_assumption',
      audience: 'small business owners and operators',
      region: 'global',
      product: 'SignalBoost SaaS console',
      observed_format: 'niche_short_9x16',
      observed_hero: 'faceless_dashboard_tour',
      confidence: 54,
      notes: [
        'Starter assumption until campaign logs and public benchmark signals are available.',
        'Use simple short clips to collect early traffic and watch-time data.',
      ],
    },
  ]
}
