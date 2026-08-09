import { ExactCacheLayer, createExactCacheKey } from './layers/exact-cache'
import { KnowledgeLayer } from './layers/knowledge'
import { MemoryLayer, type ChatMessage, type CompressedMemorySnapshot } from './layers/memory'
import {
  processReasoningLayer,
  type CanonicalToolDescription,
} from './layers/reasoning'
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
}

export async function bootCOSKernel<TGovernance = unknown>(
  payload: {
    taskId: string
    sessionId: string
    rawUserPrompt: string
    rawHistory: ChatMessage[]
    existingSnapshot?: CompressedMemorySnapshot
    availableTools: CanonicalToolDescription[]
    requestedModel: string
    policyVersion?: string | null
    knowledgeVersion?: string | null
  },
  governanceState: TGovernance,
  dependencies: COSKernelDependencies<TGovernance>,
) {
  // Layer 1: deterministic business rules always get first refusal.
  for (const rule of dependencies.businessRules ?? []) {
    const result = await rule(payload.rawUserPrompt)
    if (result.handled) {
      return { status: 'completed' as const, data: result.output, governanceState, source: 'business_rule' as const }
    }
  }

  const contextFingerprint = JSON.stringify(payload.rawHistory.slice(-2))

  const executeKnowledgeMemoryReasoning = async () => {
    // Exact cache wraps this whole pipeline, so identical concurrent work does
    // not even repeat embedding/vector lookup before provider execution.
    const semanticHit = await dependencies.knowledge.lookupSemanticCache(
      payload.taskId,
      payload.rawUserPrompt,
      contextFingerprint,
    )
    if (semanticHit) {
      return {
        status: 'completed' as const,
        data: semanticHit.responsePayload,
        governanceState,
        source: 'semantic_cache' as const,
        similarityScore: semanticHit.similarityScore,
      }
    }

    const optimizedMessages = await dependencies.memory.processMemoryLayer(
      payload.sessionId,
      payload.rawHistory,
      payload.existingSnapshot,
    )
    optimizedMessages.push({ role: 'user', content: payload.rawUserPrompt })

    const reasoningResult = await processReasoningLayer(
      {
        taskId: payload.taskId,
        messages: optimizedMessages,
        availableTools: payload.availableTools,
        requestedModel: payload.requestedModel,
      },
      governanceState,
      {
        selectCompute: dependencies.selectCompute,
        executeProvider: dependencies.executeProvider,
      },
    )

    if (reasoningResult.status === 'completed') {
      await dependencies.knowledge.commitToMemory(
        payload.taskId,
        payload.rawUserPrompt,
        contextFingerprint,
        reasoningResult.data,
      )
    }

    return { ...reasoningResult, source: 'reasoning' as const }
  }

  if (!dependencies.exactCache) return executeKnowledgeMemoryReasoning()

  // Layer 2a: cheapest reusable answer. Provider/model names are deliberately
  // excluded: COS owns knowledge identity and providers remain replaceable.
  const exactKey = createExactCacheKey({
    taskId: payload.taskId,
    prompt: payload.rawUserPrompt,
    contextFingerprint,
    policyVersion: payload.policyVersion,
    knowledgeVersion: payload.knowledgeVersion,
  })

  const exactResult = await dependencies.exactCache.execute(exactKey, executeKnowledgeMemoryReasoning)
  if (exactResult.source === 'executed') return exactResult.value

  return {
    ...exactResult.value,
    source: exactResult.source,
  }
}

export const pingBusinessRule: BusinessRule = (prompt) =>
  prompt.trim().toLowerCase() === 'ping'
    ? { handled: true, output: 'pong' }
    : { handled: false }
