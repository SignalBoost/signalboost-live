import type { TenantContext } from '@/lib/autonomous-systems/types.ts'
import type { RevenueEvent } from '../events/types.ts'

export type RevenueCurrencyMetrics = {
  currency: string
  realizedRevenue: number
  wonValue: number
  openPipelineValue: number
  weightedPipelineValue: number
  recordedCost: number
  roi: number | null
}

export type RevenueFunnel = {
  leads: number
  contacts: number
  emailsSent: number
  replies: number
  meetingsBooked: number
  meetingsCompleted: number
  opportunitiesCreated: number
  opportunitiesWon: number
  opportunitiesLost: number
  replyRate: number
  meetingRate: number
  winRate: number
}

export type RevenueAttribution = {
  key: string
  campaignId?: string
  correlationId?: string
  eventIds: readonly string[]
  realizedRevenue: Readonly<Record<string, number>>
  wonValue: Readonly<Record<string, number>>
  cost: Readonly<Record<string, number>>
}

export type RevenueForecast = {
  currency: string
  openPipelineValue: number
  weightedPipelineValue: number
  historicalWinRate: number
  probabilityAdjustedForecast: number
}

export type RevenueIntelligenceSnapshot = {
  schemaVersion: '1.0.0'
  tenant: TenantContext
  generatedAt: string
  eventCount: number
  eventIds: readonly string[]
  funnel: RevenueFunnel
  currencies: readonly RevenueCurrencyMetrics[]
  attribution: readonly RevenueAttribution[]
  forecasts: readonly RevenueForecast[]
  averageSalesCycleDays: number | null
  evidenceRefs: readonly string[]
}

export type RevenueHubInput = {
  tenant: TenantContext
  events: readonly RevenueEvent[]
  generatedAt?: string
}
