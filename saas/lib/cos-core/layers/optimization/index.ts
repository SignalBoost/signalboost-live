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
  // Widened Aug 12 to cover cosFirstAnswer's independent-reasoner path, which is a
  // DIFFERENT claim than the other five: 'reasoning' here has always meant "the
  // external cloud provider was invoked" (see estimateAvoidedCost below — cost
  // avoided is 0 for that case, because nothing was avoided). 'local_reasoner'
  // means COS's OWN self-hosted model answered — no cloud provider ran, so cost
  // WAS avoided, same as a cache hit. 'semantic_similarity' distinguishes a
  // paraphrase-match cache hit from an exact-text 'exact_cache' hit for reporting;
  // both avoid cost identically, but a dashboard breaking down WHY a call was
  // avoided needs the finer label. Reusing 'reasoning' for either would silently
  // apply the wrong cost semantics anywhere estimateAvoidedCost is called.
  source: 'business_rule' | 'exact_cache' | 'in_flight' | 'semantic_cache' | 'reasoning' | 'semantic_similarity' | 'local_reasoner'
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
