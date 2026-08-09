import type { ChatMessage } from '../memory'

export type CompressionResult = {
  messages: ChatMessage[]
  charactersBefore: number
  charactersAfter: number
}

export function compressPromptContext(messages: ChatMessage[]): CompressionResult {
  const before = messages.reduce((sum, message) => sum + message.content.length, 0)
  const compressed = messages.map((message) => ({
    ...message,
    content: message.content
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  }))
  const after = compressed.reduce((sum, message) => sum + message.content.length, 0)
  return { messages: compressed, charactersBefore: before, charactersAfter: after }
}

export type AIROIMetric = {
  taskId: string
  source: 'business_rule' | 'exact_cache' | 'in_flight' | 'semantic_cache' | 'reasoning'
  providerCalls: number
  estimatedProviderCostUsd: number
  estimatedCostAvoidedUsd: number
  promptCharactersBefore: number
  promptCharactersAfter: number
  latencyMs: number
}

export interface AIROIMetricsSink {
  record(metric: AIROIMetric): Promise<void> | void
}

export function estimateAvoidedCost(source: AIROIMetric['source'], baselineProviderCostUsd: number) {
  return source === 'reasoning' ? 0 : Math.max(0, baselineProviderCostUsd)
}
