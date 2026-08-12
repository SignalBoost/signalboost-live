export type CosLiveResponseSource =
  | 'deterministic'
  | 'semantic_cache'
  | 'semantic_similarity'
  | 'local_cos_reasoning'
  | 'external_fallback'
  | 'failed_closed'

export interface CosLiveTelemetryInput {
  responseSource: CosLiveResponseSource
  latencyMs: number
  confidence: number | null
  reasonerLabel: string | null
  localModelInvoked: boolean
  externalAiInvoked: boolean
  knowledgeFactsUsed?: number
  learnedItemsUsed?: number
  userMemoriesUsed?: number
  similarityScore?: number
  promptChars?: number
  replyChars?: number
}

export interface CosLiveTelemetryObservation extends CosLiveTelemetryInput {
  schemaVersion: 1
  at: string
  inferenceAvoided: boolean
  localCallsAvoided: number
  externalCallsAvoided: number
  estimatedInputTokensAvoided: number
  estimatedOutputTokensAvoided: number
  estimatedExternalTokensAvoided: number
  estimatedExternalCostAvoidedUsd: number
}

function tokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0
  return Math.max(1, Math.ceil(chars / 4))
}

function externalTokenCostUsd(tokens: number): number {
  const perMillion = Number(process.env.COS_ESTIMATED_EXTERNAL_COST_PER_MILLION_TOKENS_USD || '10')
  const rate = Number.isFinite(perMillion) && perMillion >= 0 ? perMillion : 10
  return Number(((tokens / 1_000_000) * rate).toFixed(8))
}

export function buildCosLiveTelemetry(input: CosLiveTelemetryInput, at = new Date().toISOString()): CosLiveTelemetryObservation {
  const reuse = input.responseSource === 'deterministic'
    || input.responseSource === 'semantic_cache'
    || input.responseSource === 'semantic_similarity'
  const inferenceAvoided = reuse && !input.localModelInvoked && !input.externalAiInvoked
  const inputTokens = tokensFromChars(input.promptChars || 0)
  const outputTokens = tokensFromChars(input.replyChars || 0)
  const externalCallsAvoided = input.externalAiInvoked ? 0 : 1
  const avoidedTokens = externalCallsAvoided ? inputTokens + outputTokens : 0

  return {
    schemaVersion: 1,
    at,
    ...input,
    inferenceAvoided,
    localCallsAvoided: inferenceAvoided ? 1 : 0,
    externalCallsAvoided,
    estimatedInputTokensAvoided: externalCallsAvoided ? inputTokens : 0,
    estimatedOutputTokensAvoided: externalCallsAvoided ? outputTokens : 0,
    estimatedExternalTokensAvoided: avoidedTokens,
    estimatedExternalCostAvoidedUsd: externalTokenCostUsd(avoidedTokens),
  }
}

export function emitCosLiveTelemetry(observation: CosLiveTelemetryObservation): void {
  console.info('[cos-live-telemetry]', JSON.stringify(observation))
}
