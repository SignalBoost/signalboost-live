import type { ExternalSignalInput } from '../external-signals'
import type { MarketingDecision } from '../marketing-decision'
import type { PresenterVideoDraft } from '../presenter-video'

export type CosChatIntelligenceInput = {
  user_text?: string
  product_or_service?: string
  audience?: string
  region?: string
  external_signals?: ExternalSignalInput[]
}

export type CosChatIntelligence = {
  ok: boolean
  summary: string
  marketing_decision: MarketingDecision
  presenter_video: PresenterVideoDraft
  external_signal_count: number
  formatted_for_chat: string
}
