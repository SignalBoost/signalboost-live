// saas/lib/ai/cos/platformIdentityContext.ts
//
// Owner rule (2026-09-03): NOTHING about SignalBoost's current configuration is hard-coded.
// The runtime supplies the facts; the neural reasoner supplies the intelligence. A hard-coded
// default is not a safety net here — it is a lie that survives a misconfiguration silently.
//
// Runtime topology changed again on 2026-09-13: RunPod is the preferred iTMounts text compute plane
// and LOCAL_AI/DeepInfra is the bounded fallback. Keep model identity, compute placement and fallback
// identity separate so the owner is never told that the fallback model is the primary model.

export type PlatformModelTopology = Readonly<{
  primaryReasonerModel: string | null
  primaryComputeProvider: 'runpod' | null
  builderPrimaryModel: string | null
  builderCodingModel: string | null
  fallbackReasonerModel: string | null
  embeddingModel: string | null
  managedProvider: string | null
}>

export const BUILDER_MODEL_NOT_CONFIGURED = 'builder_model_not_configured'

/** A configuration value that is absent is null. It is never substituted. */
function configured(value: string | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function runpodPrimaryConfigured(): boolean {
  if (process.env.RUNPOD_PRIMARY_ENABLED?.trim().toLowerCase() === 'false') return false
  return Boolean(
    configured(process.env.RUNPOD_API_KEY)
    && (configured(process.env.RUNPOD_PRIMARY_POD_ID) || configured(process.env.RUNPOD_POD_ID)),
  )
}

export function currentPlatformModelTopology(): PlatformModelTopology {
  return {
    primaryReasonerModel: configured(process.env.RUNPOD_PRIMARY_MODEL),
    primaryComputeProvider: runpodPrimaryConfigured() ? 'runpod' : null,
    builderPrimaryModel: configured(process.env.RUNPOD_PRIMARY_BUILDER_MODEL) || configured(process.env.RUNPOD_PRIMARY_MODEL),
    // Compatibility field: this is now the Builder fallback model, not the preferred worker.
    builderCodingModel: configured(process.env.DEEPINFRA_BUILDER_MODEL),
    fallbackReasonerModel: configured(process.env.LOCAL_AI_MODEL),
    embeddingModel: configured(process.env.LOCAL_AI_EMBEDDING_MODEL),
    // Compatibility field: this is the managed fallback provider when RunPod primary is enabled.
    managedProvider: configured(process.env.LOCAL_AI_MANAGED_PROVIDER),
  }
}

/**
 * Execution path. This validates the DeepInfra Builder FALLBACK only. Builder attempts graduate and
 * RunPod primary before this value is needed, so an absent fallback model must fail closed rather
 * than silently selecting an assumed provider model.
 */
export function requireBuilderCodingModel(): string {
  const model = currentPlatformModelTopology().builderCodingModel
  if (!model) throw new Error(BUILDER_MODEL_NOT_CONFIGURED)
  return model
}

const NOT_CONFIGURED = 'NOT CONFIGURED — no value is set in this runtime and no default is substituted'

function fact(label: string, value: string | null, variable: string): string {
  return `- ${label} ${value ?? `${NOT_CONFIGURED} (${variable})`}`
}

/**
 * Trusted runtime facts for the authenticated owner channel.
 *
 * This is CONTEXT, not an answer template. Public delivery never receives this block.
 */
export function ownerPlatformIdentityContext(): string {
  const topology = currentPlatformModelTopology()
  return [
    'TRUSTED OWNER RUNTIME CONTEXT — SIGNALBOOST MODEL TOPOLOGY:',
    fact('Preferred COS text compute provider:', topology.primaryComputeProvider, 'RUNPOD_API_KEY + RUNPOD_PRIMARY_POD_ID/RUNPOD_POD_ID'),
    fact('RunPod primary reasoning model setting:', topology.primaryReasonerModel, 'RUNPOD_PRIMARY_MODEL'),
    fact('RunPod primary Builder model setting:', topology.builderPrimaryModel, 'RUNPOD_PRIMARY_BUILDER_MODEL or RUNPOD_PRIMARY_MODEL'),
    fact('DeepInfra/LOCAL_AI fallback reasoning model:', topology.fallbackReasonerModel, 'LOCAL_AI_MODEL'),
    fact('DeepInfra Builder fallback model:', topology.builderCodingModel, 'DEEPINFRA_BUILDER_MODEL'),
    fact('Embedding model:', topology.embeddingModel, 'LOCAL_AI_EMBEDDING_MODEL'),
    fact('Managed fallback inference provider:', topology.managedProvider, 'LOCAL_AI_MANAGED_PROVIDER'),
    '- Operational text routing is: active scoped iTMounts graduate → RunPod primary → managed',
    '  LOCAL_AI/DeepInfra fallback. Independent University assessment remains isolated from this',
    '  preference so the learner does not silently change or become its own evaluator.',
    '- Builder uses its DeepInfra coding model only after graduate/RunPod execution is unavailable.',
    '- IDENTIFIERS ABOVE ARE VERBATIM FACTUAL ATOMS. Reproduce any configured model/provider name',
    '  EXACTLY as written. If a line says NOT CONFIGURED, say that it is not currently configured;',
    '  do not supply a likely model, provider, version suffix, date, or release tag.',
    '- Treat these lines as current runtime facts, not as a scripted response. Reason over the user',
    '  request and these facts together and distinguish model ownership from compute-provider identity.',
  ].join('\n')
}
