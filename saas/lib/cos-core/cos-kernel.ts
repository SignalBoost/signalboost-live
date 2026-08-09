import { ExactCacheLayer, createExactCacheKey } from './layers/exact-cache'
import { KnowledgeLayer } from './layers/knowledge'
import { MemoryLayer, type ChatMessage, type CompressedMemorySnapshot } from './layers/memory'
import { compressPromptContext, estimateAvoidedCost, type AIROIMetricsSink } from './layers/optimization'
import { processReasoningLayer, type CanonicalToolDescription } from './layers/reasoning'
import type { ComputeSelector, Layer5Executor } from './layers/reasoning/types'

export type BusinessRuleResult = { handled: true; output: unknown } | { handled: false }
export type BusinessRule = (prompt: string) => BusinessRuleResult | Promise<BusinessRuleResult>

export type COSKernelDependencies<TGovernance> = {
  knowledge: KnowledgeLayer
  memory: MemoryLayer
  selectCompute: ComputeSelector<TGovernance>
  executeProvider: Layer5Executor
  businessRules?: BusinessRule[]
  exactCache?: ExactCacheLayer
  roiMetrics?: AIROIMetricsSink
  baselineProviderCostUsd?: number
  onTelemetryError?: (error: unknown) => void
}

export async function bootCOSKernel<TGovernance = unknown>(payload: {
  taskId: string
  sessionId: string
  rawUserPrompt: string
  rawHistory: ChatMessage[]
  existingSnapshot?: CompressedMemorySnapshot
  availableTools: CanonicalToolDescription[]
  requestedModel: string
  policyVersion?: string | null
  knowledgeVersion?: string | null
}, governanceState: TGovernance, dependencies: COSKernelDependencies<TGovernance>) {
  const startedAt = Date.now()
  const baselineCost = dependencies.baselineProviderCostUsd ?? 0
  const rawCharacters = payload.rawHistory.reduce((sum, message) => sum + message.content.length, 0) + payload.rawUserPrompt.length

  const recordROI = async (source: 'business_rule' | 'exact_cache' | 'in_flight' | 'semantic_cache' | 'reasoning', before = rawCharacters, after = rawCharacters) => {
    if (!dependencies.roiMetrics) return
    try {
      await dependencies.roiMetrics.record({
        taskId: payload.taskId,
        source,
        providerCalls: source === 'reasoning' ? 1 : 0,
        estimatedProviderCostUsd: source === 'reasoning' ? baselineCost : 0,
        estimatedCostAvoidedUsd: estimateAvoidedCost(source, baselineCost),
        promptCharactersBefore: before,
        promptCharactersAfter: after,
        latencyMs: Date.now() - startedAt,
      })
    } catch (error) {
      dependencies.onTelemetryError?.(error)
    }
  }

  for (const rule of dependencies.businessRules ?? []) {
    const result = await rule(payload.rawUserPrompt)
    if (result.handled) {
      await recordROI('business_rule')
      return { status: 'completed' as const, data: result.output, governanceState, source: 'business_rule' as const }
    }
  }

  const contextFingerprint = JSON.stringify(payload.rawHistory.slice(-2))
  const executeKnowledgeMemoryReasoning = async () => {
    const semanticHit = await dependencies.knowledge.lookupSemanticCache(payload.taskId, payload.rawUserPrompt, contextFingerprint)
    if (semanticHit) {
      await recordROI('semantic_cache')
      return { status: 'completed' as const, data: semanticHit.responsePayload, governanceState, source: 'semantic_cache' as const, similarityScore: semanticHit.similarityScore }
    }

    const optimizedMessages = await dependencies.memory.processMemoryLayer(payload.sessionId, payload.rawHistory, payload.existingSnapshot)
    optimizedMessages.push({ role: 'user', content: payload.rawUserPrompt })
    const compressed = compressPromptContext(optimizedMessages)

    const reasoningResult = await processReasoningLayer({
      taskId: payload.taskId,
      messages: compressed.messages,
      availableTools: payload.availableTools,
      requestedModel: payload.requestedModel,
    }, governanceState, { selectCompute: dependencies.selectCompute, executeProvider: dependencies.executeProvider })

    if (reasoningResult.status === 'completed') {
      await dependencies.knowledge.commitToMemory(payload.taskId, payload.rawUserPrompt, contextFingerprint, reasoningResult.data)
    }
    await recordROI('reasoning', compressed.charactersBefore, compressed.charactersAfter)
    return { ...reasoningResult, source: 'reasoning' as const }
  }

  if (!dependencies.exactCache) return executeKnowledgeMemoryReasoning()

  const exactKey = createExactCacheKey({
    taskId: payload.taskId,
    prompt: payload.rawUserPrompt,
    contextFingerprint,
    policyVersion: payload.policyVersion,
    knowledgeVersion: payload.knowledgeVersion,
  })
  const exactResult = await dependencies.exactCache.execute(exactKey, executeKnowledgeMemoryReasoning)
  if (exactResult.source === 'executed') return exactResult.value

  await recordROI(exactResult.source)
  return { ...exactResult.value, source: exactResult.source }
}

export const pingBusinessRule: BusinessRule = (prompt) => prompt.trim().toLowerCase() === 'ping'
  ? { handled: true, output: 'pong' }
  : { handled: false }
