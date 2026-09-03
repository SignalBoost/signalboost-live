// saas/lib/ai/cos/platformIdentityContext.ts

export const DEFAULT_COS_REASONER_MODEL = 'Qwen/Qwen3.6-35B-A3B'
export const DEFAULT_BUILDER_CODING_MODEL = 'deepseek-ai/DeepSeek-V4-Pro'
export const DEFAULT_COS_EMBEDDING_MODEL = 'BAAI/bge-base-en-v1.5'
export const DEFAULT_COS_MANAGED_PROVIDER = 'deepinfra'

export type PlatformModelTopology = Readonly<{
  primaryReasonerModel: string
  builderCodingModel: string
  embeddingModel: string
  managedProvider: string
}>

export function currentPlatformModelTopology(): PlatformModelTopology {
  return {
    primaryReasonerModel: process.env.LOCAL_AI_MODEL?.trim() || DEFAULT_COS_REASONER_MODEL,
    builderCodingModel: process.env.DEEPINFRA_BUILDER_MODEL?.trim() || DEFAULT_BUILDER_CODING_MODEL,
    embeddingModel: process.env.LOCAL_AI_EMBEDDING_MODEL?.trim() || DEFAULT_COS_EMBEDDING_MODEL,
    managedProvider: process.env.LOCAL_AI_MANAGED_PROVIDER?.trim() || DEFAULT_COS_MANAGED_PROVIDER,
  }
}

/**
 * Trusted runtime facts for the authenticated owner channel.
 *
 * This is CONTEXT, not an answer template. The neural reasoner receives these facts on ordinary
 * owner turns and decides from the meaning of the user's request whether they are relevant, how
 * much detail to use, and how to explain the relationship between components. No regex/detector
 * selects a canned owner identity answer.
 *
 * Public delivery never receives this block; public model/provider disclosure remains a separate
 * deterministic safety boundary.
 */
export function ownerPlatformIdentityContext(): string {
  const topology = currentPlatformModelTopology()
  return [
    'TRUSTED OWNER RUNTIME CONTEXT — SIGNALBOOST MODEL TOPOLOGY:',
    `- General COS reasoning model: ${topology.primaryReasonerModel}`,
    `- Builder / Platform Engineer coding-specialist model: ${topology.builderCodingModel}`,
    `- Embedding model: ${topology.embeddingModel}`,
    `- Managed inference provider: ${topology.managedProvider}`,
    '- The Builder coding model is task-specialized. It is selected only after work is routed into',
    '  authenticated COS Builder / Platform Engineer coding execution; it does not replace the',
    '  general COS reasoner for ordinary conversation, analysis, research synthesis, or Concierge.',
    '- Treat these lines as current runtime facts, not as a scripted response. Reason over the',
    '  user request and these facts together. Decide relevance semantically, explain roles and',
    '  relationships in your own words, and do not mechanically echo this block.',
    '- If the owner asks broadly about your model, architecture, specs, stack, or what runs a',
    '  capability, distinguish the general reasoner from specialized models when that distinction',
    '  materially answers the question. Never imply that one specialist model powers the whole platform.',
  ].join('\n')
}
