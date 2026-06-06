export type SupportedVideoLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export type VideoJobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type VideoJobType = 'transcode' | 'export'
export type SubscriptionTier = 'free' | 'demo' | 'launch' | 'growth' | 'command' | 'paid'

export type CaptionCue = {
  id: string
  start: number
  end: number
  text: string
}

export type CaptionStyle = {
  fontFamily: string
  color: string
  backgroundColor: string
  fontSize: number
  animation: 'none' | 'fade' | 'slide' | 'pop'
  x: number
  y: number
}

export type VideoQuota = {
  tier: SubscriptionTier
  usedMinutes: number
  includedMinutes: number
  overageMinutes: number
  overageRateUsd: number
  exportEnabled: boolean
  demoOnly: boolean
  requiresOverageCharge: boolean
  overageProvider: 'stripe' | 'paypal'
}

export type VideoExportPayload = {
  sourceUrl: string
  filename: string
  durationSec: number
  captions: CaptionCue[]
  style: CaptionStyle
  locale: SupportedVideoLocale
  tier: SubscriptionTier
  usedMinutes: number
  billingProvider?: 'stripe' | 'paypal'
}

export type JsonSafeVideoResponse<T> = {
  ok: boolean
  data: T | null
  error: string | null
  meta: {
    locale: SupportedVideoLocale
    generatedAt: string
  }
}

export const defaultCaptionStyle: CaptionStyle = {
  fontFamily: 'Inter, Arial, sans-serif',
  color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.68)',
  fontSize: 34,
  animation: 'fade',
  x: 50,
  y: 78,
}
