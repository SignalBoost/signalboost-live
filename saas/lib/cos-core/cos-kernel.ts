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

  // Layer 2: tenant/task-scoped semantic knowledge before any model call.
  const contextFingerprint = JSON.stringify(payload.rawHistory.slice(-2))
  const cacheHit = await dependencies.knowledge.lookupSemanticCache(
    payload.taskId,
    payload.rawUserPrompt,
    contextFingerprint,
  )
  if (cacheHit) {
    return {
      status: 'completed' as const,
      data: cacheHit.responsePayload,
      governanceState,
      source: 'semantic_cache' as const,
      similarityScore: cacheHit.similarityScore,
    }
  }

  // Layer 3: bound the history sent to reasoning/provider infrastructure.
  const optimizedMessages = await dependencies.memory.processMemoryLayer(
    payload.sessionId,
    payload.rawHistory,
    payload.existingSnapshot,
  )
  optimizedMessages.push({ role: 'user', content: payload.rawUserPrompt })

  // Layers 4/5: vendor-neutral reasoning followed by the selected provider.
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

  // Only final, successfully resolved responses become reusable knowledge.
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

export const pingBusinessRule: BusinessRule = (prompt) =>
  prompt.trim().toLowerCase() === 'ping'
    ? { handled: true, output: 'pong' }
    : { handled: false }
