import type { UrlIntelligenceResult } from '@/lib/enterprise/url-intelligence/types'
import type { EnterpriseMemoryContext } from '@/lib/enterprise/memory/retriever'

export type EnterpriseWorkspace = 'cosa' | 'campaign-studio' | 'business' | 'creator' | 'podcast' | 'store'

export type EnterpriseIntelligenceRequest = {
  sourceUrl: string
  workspace: EnterpriseWorkspace
}

export type EnterpriseApprovalPackage = {
  workspace: EnterpriseWorkspace
  sourceUrl: string
  organization: string
  description: string
  sourceType: UrlIntelligenceResult['sourceType']
  classification: {
    industry: string
    audiences: string[]
    region: string
    language: string
  }
  campaignPlan: {
    goal: string
    tone: string
    platforms: string[]
    format: string
    offerType: string
    ctaStrategy: string
  }
  creativeSuggestions: Array<{
    id: string
    title: string
    description: string
    metadata: string[]
  }>
  memoryContext?: EnterpriseMemoryContext
  confidence: Record<string, number>
  requiresConfirmation: string[]
  intelligence: UrlIntelligenceResult
  approvalRequired: true
}
