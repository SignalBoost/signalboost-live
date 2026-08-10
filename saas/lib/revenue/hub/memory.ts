import { mergeIntelligence } from '@/lib/enterprise/memory/service.ts'
import type { RevenueIntelligenceSnapshot } from './types.ts'

export function buildRevenueLearningPayload(snapshot: RevenueIntelligenceSnapshot) {
  return {
    revenue: {
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      eventCount: snapshot.eventCount,
      funnel: snapshot.funnel,
      currencies: snapshot.currencies,
      attribution: snapshot.attribution,
      forecasts: snapshot.forecasts,
      averageSalesCycleDays: snapshot.averageSalesCycleDays,
      evidenceRefs: snapshot.evidenceRefs,
    },
  }
}

export async function persistRevenueIntelligence(args: {
  organizationId: string
  snapshot: RevenueIntelligenceSnapshot
  workspace?: string
}): Promise<void> {
  await mergeIntelligence({
    organizationId: args.organizationId,
    workspace: args.workspace || 'revenue',
    snapshot: buildRevenueLearningPayload(args.snapshot),
    confidence: {
      revenue: args.snapshot.eventCount > 0 ? 1 : 0,
      attribution: args.snapshot.attribution.length > 0 ? 1 : 0,
      forecast: args.snapshot.forecasts.length > 0 ? 0.8 : 0,
    },
    schemaVersion: 1,
  })
}
