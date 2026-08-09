import type { ChatMessage } from '../memory'

export type CompressionResult = {
  messages: ChatMessage[]
  charactersBefore: number
  charactersAfter: number
}

/**
 * Lossless prompt compression only.
 *
 * COS must never mutate user/provider-visible content merely to save tokens.
 * Instead, remove only byte-identical duplicate messages while preserving
 * order and the exact content of every retained message. This safely removes
 * repeated system/context injections without changing code, YAML, whitespace,
 * fixed-width data, or exact-formatting requests.
 */
export function compressPromptContext(messages: ChatMessage[]): CompressionResult {
  const before = messages.reduce((sum, message) => sum + message.content.length, 0)
  const seenSystemMessages = new Set<string>()
  const compressed: ChatMessage[] = []

  for (const message of messages) {
    const previous = compressed.at(-1)
    if (previous && previous.role === message.role && previous.name === message.name && previous.content === message.content) {
      continue
    }

    if (message.role === 'system') {
      const identity = `${message.name ?? ''}\u0000${message.content}`
      if (seenSystemMessages.has(identity)) continue
      seenSystemMessages.add(identity)
    }

    compressed.push({ ...message })
  }

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
