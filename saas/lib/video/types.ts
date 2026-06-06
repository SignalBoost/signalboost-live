export type CaptionCue = {
  id: string
  start: number
  end: number
  text: string
}

export type CaptionStyle = {
  fontFamily: string
  fontSize: number
  color: string
  backgroundColor: string
  animation: 'none' | 'fade' | 'slide' | 'pop'
  x: number
  y: number
}

export const defaultCaptionStyle: CaptionStyle = {
  fontFamily: 'Inter, Arial, sans-serif',
  fontSize: 40,
  color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.7)',
  animation: 'fade',
  x: 50,
  y: 70,
}

export type SupportedVideoLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export type VideoQuota = {
  usedMinutes: number
  includedMinutes: number
  demoOnly: boolean
  requiresOverageCharge: boolean
  overageMinutes: number
  overageRateUsd: number
  overageProvider: 'stripe' | 'none'
  exportEnabled: boolean
}
