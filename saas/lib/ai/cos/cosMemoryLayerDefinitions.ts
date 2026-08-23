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
  'When defining or comparing COS components, explain their purpose, scope, lifetime, and authority. Do not force incident-diagnostic observables, falsifiers, database wait events, or prompt examples into a conceptual answer unless the user asks for diagnosis or verification. When the user supplies multiple dated policy or context records, treat them as task premises: a later record with explicit scope or an effective-immediately directive supersedes conflicting older rules within that scope, while older rules remain only where they do not conflict. Never recommend an action that violates the controlling newer record unless the prompt explicitly supplies exception authority.'


/** Detect when the recorded answer materially used a canonical COS definition. */
const ENTERPRISE_MEMORY_FINGERPRINT = /durable organization-scoped operational knowledge/i
const SEMANTIC_CACHE_FINGERPRINT = /policy-versioned, age-bounded reuse/i
export type CanonicalSelfKnowledgeContribution = { enterpriseMemoryDefinition:boolean; semanticCacheDefinition:boolean; used:boolean }
export function canonicalSelfKnowledgeContribution(answer:string):CanonicalSelfKnowledgeContribution {
  const text=String(answer ?? '')
  const enterpriseMemoryDefinition=ENTERPRISE_MEMORY_FINGERPRINT.test(text)
  const semanticCacheDefinition=SEMANTIC_CACHE_FINGERPRINT.test(text)
  return { enterpriseMemoryDefinition, semanticCacheDefinition, used:enterpriseMemoryDefinition || semanticCacheDefinition }
}
