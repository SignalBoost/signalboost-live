// saas/lib/ai/cos/embeddingEndpoint.ts
//
// Where embedding requests go — resolved separately from the reasoner.
//
// WHY THIS IS ITS OWN FILE: localEmbeddings.ts imports '@/lib/ai/local-inference', an aliased path
// that plain `node --test` cannot resolve outside the Next.js build. Keeping the decision logic here
// with NO '@/' imports makes it directly testable, which matters because the property it protects is
// silent when broken.
//
// THE COUPLING THIS BREAKS (found Aug 20 2026): embeddings used to resolve their endpoint by calling
// localInferenceConfigFromEnv() directly, so LOCAL_AI_BASE_URL pointed the reasoner AND the embedder
// at the same host. During a provider migration that is a trap — repoint the reasoner at a per-token
// inference host that serves chat models but no 768-dimension embedding model, and completions look
// perfectly healthy while every embedding call fails dimension validation. The semantic cache and
// learned-corpus retrieval stop working, which means LEARNING stops working, with no error anywhere
// near the real cause.
//
// The two workloads have genuinely different constraints:
//   - the reasoner is swappable by design; any capable model can serve it
//   - the embedder is PINNED by the database — 768 dims, or migrate the column and re-embed
//
// So they get separate dials. Defaults keep them together, so this changes nothing until used.

/** Structural copy of LocalInferenceConfig — deliberately not imported, to keep this file alias-free. */
export type EndpointConfig = {
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs: number
}

/** nomic-embed-text's real output size. Must match cos_knowledge_records vector(768). */
export const LOCAL_EMBEDDING_DIMENSIONS = 768
export const DEFAULT_LOCAL_EMBEDDING_MODEL = 'nomic-embed-text'

type Env = Record<string, string | undefined>

function trimmed(env: Env, key: string): string {
  return String(env[key] ?? '').trim()
}

export function embeddingModelName(env: Env = process.env): string {
  return trimmed(env, 'LOCAL_AI_EMBEDDING_MODEL') || DEFAULT_LOCAL_EMBEDDING_MODEL
}

/** True when embeddings have been pointed at a host of their own. */
export function embeddingEndpointIsSeparate(env: Env = process.env): boolean {
  return trimmed(env, 'LOCAL_AI_EMBEDDING_BASE_URL').length > 0
}

/**
 * Resolve the embedding endpoint from the reasoner's config plus any dedicated overrides.
 *
 * Unset overrides mean identical behaviour to before this split existed.
 */
export function resolveEmbeddingConfig(base: EndpointConfig, env: Env = process.env): EndpointConfig {
  const overrideUrl = trimmed(env, 'LOCAL_AI_EMBEDDING_BASE_URL')
  const overrideKey = trimmed(env, 'LOCAL_AI_EMBEDDING_API_KEY')
  const model = embeddingModelName(env)

  if (!overrideUrl) {
    // Same host as the reasoner. An embedding-specific key is still honoured, since one gateway can
    // legitimately issue per-purpose credentials.
    return { ...base, model, apiKey: overrideKey || base.apiKey }
  }

  return {
    ...base,
    baseUrl: overrideUrl.replace(/\/$/, ''),
    model,
    // Deliberately NOT inheriting base.apiKey. The point of splitting is that these are different
    // vendors, and forwarding the reasoner's credential to a third party would leak it.
    apiKey: overrideKey || undefined,
  }
}
