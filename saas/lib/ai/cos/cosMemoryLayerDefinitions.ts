/**
 * Canonical, code-derived distinctions for COS memory layers.
 * Keep these definitions dependency-free so prompts, verified self-knowledge, and regression tests
 * cannot drift into treating an embedding index as the memory or a cache as durable knowledge.
 */
export const ENTERPRISE_MEMORY_DEFINITION =
  'Enterprise Memory is durable organization-scoped operational knowledge retrieved only inside an authorized organization context. It stores reusable enterprise facts, decisions, history, and intelligence; it is not an answer cache.'

export const SEMANTIC_ANSWER_CACHE_DEFINITION =
  'Semantic Cache is policy-versioned, age-bounded reuse of a previously generated answer when a new request is sufficiently similar. Embeddings are only the retrieval index, not the cached knowledge itself. Organization- or user-scoped context must never be reused through an unscoped cache entry.'

export const MEMORY_LAYER_COMPARISON_GUARDRAIL =
  'When defining or comparing COS components, explain their purpose, scope, lifetime, and authority. Do not force incident-diagnostic observables, falsifiers, database wait events, or prompt examples into a conceptual answer unless the user asks for diagnosis or verification.'
