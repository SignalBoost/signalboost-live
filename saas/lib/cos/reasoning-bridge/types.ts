import type { ExternalSignalInput, ExternalSignalIngestionResult } from '../external-signals'
import type { MarketingDecision, MarketingDecisionInput } from '../marketing-decision'

export type CosReasoningBridgeInput = {
  user_text?: string
  surface?: string
  campaign_goal?: MarketingDecisionInput['campaign_goal']
  product_or_service?: string
  audience?: string
  region?: string
  external_signals?: ExternalSignalInput[]
}

export type CosReasoningBridgeOutput = {
  id: string
  surface: string
  user_text: string
  signal_ingestion: ExternalSignalIngestionResult
  marketing_decision: MarketingDecision
  analogical_reasoning_prompt: string
  statistical_validation_summary: string
  formatted_context: string
  created_at: string
}
