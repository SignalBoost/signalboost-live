// saas/lib/ai/cos/embeddingEndpoint.ts
//
// Embedding endpoint selection is deliberately separate from text-reasoner selection.
// The vector space is persistent data: changing models without a complete re-index silently makes
// old and new vectors incomparable even when both happen to have the same number of dimensions.
//
// LOCAL_AI_* remains the managed/fallback embedding transport. RunPod primary uses a distinct set
// of variables so enabling owned compute never destroys the DeepInfra fallback configuration.

/** Structural copy of LocalInferenceConfig — deliberately alias-free for direct node:test use. */
export type EndpointConfig = {
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
}

/** nomic-embed-text's output size and the current pgvector schema width. */
export const LOCAL_EMBEDDING_DIMENSIONS = 768
export const DEFAULT_LOCAL_EMBEDDING_MODEL = 'nomic-embed-text'

type Env = Record<string, string | undefined>

export type RunpodEmbeddingPrimaryReason =
  | 'ready'
  | 'not_configured'
  | 'missing_model'
  | 'missing_api_key'
  | 'invalid_url'
  | 'non_runpod_host'
  | 'model_space_mismatch'

export type RunpodEmbeddingPrimaryResolution = Readonly<{
  config: EndpointConfig | null
  reason: RunpodEmbeddingPrimaryReason
  expectedModel: string
  configuredModel: string | null
}>

function trimmed(env: Env, key: string): string {
  return String(env[key] ?? '').trim()
}

export function embeddingModelName(env: Env = process.env): string {
  return trimmed(env, 'LOCAL_AI_EMBEDDING_MODEL') || DEFAULT_LOCAL_EMBEDDING_MODEL
}

/** True when the managed/fallback embedding endpoint has been split from LOCAL_AI_BASE_URL. */
export function embeddingEndpointIsSeparate(env: Env = process.env): boolean {
  return trimmed(env, 'LOCAL_AI_EMBEDDING_BASE_URL').length > 0
}

/**
 * Resolve the managed/fallback embedding endpoint from the reasoner config plus optional dedicated
 * embedding overrides. A split endpoint never inherits the reasoner credential.
 */
export function resolveEmbeddingConfig(base: EndpointConfig, env: Env = process.env): EndpointConfig {
  const overrideUrl = trimmed(env, 'LOCAL_AI_EMBEDDING_BASE_URL')
  const overrideKey = trimmed(env, 'LOCAL_AI_EMBEDDING_API_KEY')
  const model = embeddingModelName(env)

  if (!overrideUrl) {
    return { ...base, model, apiKey: overrideKey || base.apiKey }
  }

  return {
    ...base,
    baseUrl: overrideUrl.replace(/\/$/, ''),
    model,
    apiKey: overrideKey || undefined,
  }
}

function runpodEmbeddingHostAllowed(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  return host === 'api.runpod.ai' || host.endsWith('.proxy.runpod.net')
}

function boundedTimeout(value: string, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(5_000, Math.min(300_000, Math.round(parsed)))
}

/**
 * Resolve an optional RunPod embedding PRIMARY while preserving the managed config as fallback.
 *
 * Safety invariants:
 * - the endpoint must be HTTPS and hosted by RunPod;
 * - it gets a dedicated embedding credential, never RUNPOD_API_KEY and never the fallback key;
 * - its model identifier must exactly match LOCAL_AI_EMBEDDING_MODEL so a 768-dimension but
 *   semantically different vector space can never be mixed into the existing pgvector corpus.
 *
 * The endpoint may be a fixed Pod proxy or RunPod Serverless OpenAI-compatible endpoint. This
 * resolver never starts compute; lifecycle/scaling belongs to RunPod or the caller's runtime layer.
 */
export function resolveRunpodPrimaryEmbeddingConfig(
  fallback: EndpointConfig,
  env: Env = process.env,
): RunpodEmbeddingPrimaryResolution {
  const expectedModel = embeddingModelName(env)
  const baseUrlRaw = trimmed(env, 'RUNPOD_PRIMARY_EMBEDDING_BASE_URL')
  const configuredModel = trimmed(env, 'RUNPOD_PRIMARY_EMBEDDING_MODEL') || null
  const apiKey = trimmed(env, 'RUNPOD_PRIMARY_EMBEDDING_API_KEY')

  if (!baseUrlRaw) {
    return { config: null, reason: 'not_configured', expectedModel, configuredModel }
  }
  if (!configuredModel) {
    return { config: null, reason: 'missing_model', expectedModel, configuredModel }
  }
  if (!apiKey) {
    return { config: null, reason: 'missing_api_key', expectedModel, configuredModel }
  }
  if (configuredModel !== expectedModel) {
    return { config: null, reason: 'model_space_mismatch', expectedModel, configuredModel }
  }

  let url: URL
  try {
    url = new URL(baseUrlRaw)
  } catch {
    return { config: null, reason: 'invalid_url', expectedModel, configuredModel }
  }
  if (url.protocol !== 'https:') {
    return { config: null, reason: 'invalid_url', expectedModel, configuredModel }
  }
  if (!runpodEmbeddingHostAllowed(url.hostname)) {
    return { config: null, reason: 'non_runpod_host', expectedModel, configuredModel }
  }
  if (url.username || url.password) {
    return { config: null, reason: 'invalid_url', expectedModel, configuredModel }
  }

  return {
    config: {
      baseUrl: url.toString().replace(/\/$/, ''),
      model: expectedModel,
      apiKey,
      // Primary failure must degrade quickly to the managed fallback. Do not inherit a two-minute
      // DeepInfra timeout for a cold/unavailable Serverless worker unless explicitly requested.
      timeoutMs: boundedTimeout(
        trimmed(env, 'RUNPOD_PRIMARY_EMBEDDING_TIMEOUT_MS'),
        Math.min(fallback.timeoutMs, 20_000),
      ),
    },
    reason: 'ready',
    expectedModel,
    configuredModel,
  }
}
