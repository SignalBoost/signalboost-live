export type IntelligenceSourceType = 'website' | 'github'

export type ConfidenceValue<T extends string = string> = {
  value: T
  confidence: number
  alternatives?: T[]
  evidence: string[]
}

export type UrlIntelligenceResult = {
  sourceType: IntelligenceSourceType
  sourceUrl: string
  finalUrl: string
  title: string
  description: string
  organization?: string
  repository?: {
    owner: string
    name: string
    primaryLanguage?: string
    stars?: number
    forks?: number
    license?: string
    topics: string[]
    defaultBranch?: string
  }
  detected: {
    industry: ConfidenceValue
    goal: ConfidenceValue
    audiences: ConfidenceValue[]
    tone: ConfidenceValue
    region: ConfidenceValue
    platforms: ConfidenceValue[]
    format: ConfidenceValue
    offerType: ConfidenceValue
    ctaStrategy: ConfidenceValue
  }
  metadata: {
    language?: string
    keywords: string[]
    socialLinks: string[]
    technologies: string[]
  }
  requiresConfirmation: string[]
  analyzedAt: string
}

export type SafeFetchResult = {
  finalUrl: string
  contentType: string
  body: string
  status: number
}
