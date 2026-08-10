// Provider/model cost-avoidance telemetry for the Business Intelligence Corpus.
// Pure calculation boundary: persistence/analytics callers can store the event
// in their existing telemetry pipeline without coupling lookup to billing.

export type CorpusAvoidanceEvent = Readonly<{
  resolvedInternally: boolean
  externalProviderCallsAvoided: number
  aiCallsAvoided: number
  estimatedProviderCostAvoided: number
  estimatedAiCostAvoided: number
  currency: 'USD'
}>

export function corpusAvoidanceEvent(args: {
  resolvedInternally: boolean
  plannedProviderCalls?: number
  plannedAiCalls?: number
  providerCostPerCallUsd?: number
  aiCostPerCallUsd?: number
}): CorpusAvoidanceEvent {
  const providerCalls = args.resolvedInternally ? Math.max(0, args.plannedProviderCalls ?? 1) : 0
  const aiCalls = args.resolvedInternally ? Math.max(0, args.plannedAiCalls ?? 0) : 0
  return {
    resolvedInternally: args.resolvedInternally,
    externalProviderCallsAvoided: providerCalls,
    aiCallsAvoided: aiCalls,
    estimatedProviderCostAvoided: providerCalls * Math.max(0, args.providerCostPerCallUsd ?? 0),
    estimatedAiCostAvoided: aiCalls * Math.max(0, args.aiCostPerCallUsd ?? 0),
    currency: 'USD',
  }
}
