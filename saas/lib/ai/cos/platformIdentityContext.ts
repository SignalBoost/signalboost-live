// saas/lib/ai/cos/platformIdentityContext.ts

export const BUILDER_MODEL_NOT_CONFIGURED = 'builder_model_not_configured'

export type PlatformModelTopology = Readonly<{
  primaryReasonerModel: string | null
  builderCodingModel: string | null
  embeddingModel: string | null
  managedProvider: string | null
}>

type RuntimeTopologyVariable =
  | 'LOCAL_AI_MODEL'
  | 'DEEPINFRA_BUILDER_MODEL'
  | 'LOCAL_AI_EMBEDDING_MODEL'
  | 'LOCAL_AI_MANAGED_PROVIDER'

function configuredValue(name: RuntimeTopologyVariable): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

export function requireBuilderCodingModel(): string {
  const model = configuredValue('DEEPINFRA_BUILDER_MODEL')
  if (!model) throw new Error(BUILDER_MODEL_NOT_CONFIGURED)
  return model
}

export function currentPlatformModelTopology(): PlatformModelTopology {
  return {
    primaryReasonerModel: configuredValue('LOCAL_AI_MODEL'),
    builderCodingModel: configuredValue('DEEPINFRA_BUILDER_MODEL'),
    embeddingModel: configuredValue('LOCAL_AI_EMBEDDING_MODEL'),
    managedProvider: configuredValue('LOCAL_AI_MANAGED_PROVIDER'),
  }
}

function runtimeFact(value: string | null, variable: RuntimeTopologyVariable): string {
  return value ?? `[NOT CONFIGURED: ${variable}]`
}

/**
 * Trusted runtime facts for the authenticated owner channel.
 *
 * This is CONTEXT, not an answer template. Every mutable identifier in this block comes only from
 * the live process environment. There are deliberately no model/provider-name fallbacks here: if a
 * value is missing, owner self-knowledge reports NOT CONFIGURED instead of substituting a plausible
 * default. The neural reasoner may explain the supplied facts, but it must not alter, expand,
 * abbreviate, version-complete, or otherwise invent an identifier.
 *
 * Public delivery never receives this block; public model/provider disclosure remains a separate
 * deterministic safety boundary.
 */
export function ownerPlatformIdentityContext(): string {
  const topology = currentPlatformModelTopology()
  return [
    'TRUSTED OWNER RUNTIME CONTEXT — SIGNALBOOST MODEL TOPOLOGY:',
    `- General COS reasoning model: ${runtimeFact(topology.primaryReasonerModel, 'LOCAL_AI_MODEL')}`,
    `- Builder / Platform Engineer coding-specialist model: ${runtimeFact(topology.builderCodingModel, 'DEEPINFRA_BUILDER_MODEL')}`,
    `- Embedding model: ${runtimeFact(topology.embeddingModel, 'LOCAL_AI_EMBEDDING_MODEL')}`,
    `- Managed inference provider: ${runtimeFact(topology.managedProvider, 'LOCAL_AI_MANAGED_PROVIDER')}`,
    '- VERBATIM FACTUAL ATOMS: exact identifiers above are immutable runtime facts for this turn.',
    '- Quote a configured identifier verbatim when needed. Do not alter, expand, abbreviate, infer,',
    '  translate, normalize, alias, or version-complete any identifier. A NOT CONFIGURED value is',
    '  uncertainty to report, never permission to supply a default from model knowledge or source code.',
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
