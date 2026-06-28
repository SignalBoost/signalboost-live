import type { MarketingFormatChoice, MarketingHeroChoice, MarketingSignal } from '../marketing-decision'

export type ExternalSignalSourceType =
  | 'web_research'
  | 'public_dataset'
  | 'field_benchmark'
  | 'campaign_log'
  | 'manual_observation'

export type ExternalSignalInput = {
  source_type: ExternalSignalSourceType
  source_name: string
  source_url?: string
  audience?: string
  region?: string
  product?: string
  observed_format?: MarketingFormatChoice
  observed_hero?: MarketingHeroChoice
  views?: number
  clicks?: number
  conversions?: number
  watch_seconds?: number
  confidence?: number
  notes?: string[]
}

export type NormalizedExternalSignal = ExternalSignalInput & {
  id: string
  normalized_at: string
  marketing_signal: MarketingSignal
}

export type ExternalSignalIngestionResult = {
  ok: boolean
  signals: NormalizedExternalSignal[]
  marketing_signals: MarketingSignal[]
  summary: string[]
}
