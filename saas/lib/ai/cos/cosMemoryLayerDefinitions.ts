// saas/lib/ai/cos/cosMemoryLayerDefinitions.ts
/**
 * Canonical, code-derived distinctions for COS memory layers.
 * Keep these definitions dependency-free so prompts, verified self-knowledge, and regression tests
 * cannot drift into treating an embedding index as the memory or a cache as durable knowledge.
 */
export const SEMANTIC_MEMORY_DEFINITION =
  'Semantic Memory is meaning-based retrieval across durable COS knowledge and context. It uses embeddings/vector similarity to find relevant facts, documents, learned material, enterprise memory, user memory, and other authorized records even when wording differs. Embeddings are retrieval indexes, not truth; current-world facts still require live evidence when freshness policy says so.'

export const CREATIVE_MEMORY_DEFINITION =
  'Creative Memory is durable, validated memory of successful approaches, structures, styles, useful elements, constraints, and outcome-backed patterns. It guides how COS solves or presents a task; it is not factual evidence and must never be used to prove that a real-world claim is true. Raw model output cannot approve itself into Creative Memory.'

export const ENTERPRISE_MEMORY_DEFINITION =
  'Enterprise Memory is durable organization-scoped operational knowledge retrieved only inside an authorized organization context. It stores reusable enterprise facts, decisions, history, and intelligence; it is not an answer cache.'

export const SEMANTIC_ANSWER_CACHE_DEFINITION =
  'Semantic Cache is policy-versioned, age-bounded reuse of a previously generated answer when a new request is sufficiently similar. Embeddings are only the retrieval index, not the cached knowledge itself. Organization- or user-scoped context must never be reused through an unscoped cache entry.'

// Owner-approved company-identity fact (2026-08-24; product renamed 2026-09-26). Kept as a fixed,
// deterministic definition — never model-guessed — for the same reason ownership stays out of this
// description: it is not COS's place to invent or infer who owns the company, only to state what the
// owner has authorized. Owner decision 2026-09-26: the public product is iTMounts and answers say nothing
// about SignalBoost. Production that day answered "What is iTMounts?" with a guess about mountaineering
// because this definition still named only the internal name. The second sentence is the owner's own
// public site copy (itmounts.com).
export const SIGNALBOOST_COMPANY_IDENTITY_DEFINITION =
  'iTMounts (itmounts.com) is a privately owned U.S. AI platform that develops intelligent software and automation solutions for small and medium-sized businesses, as well as enterprise and Fortune 500 organizations. It offers AI-powered websites, customer reviews, and audio and video content for businesses that want to grow in every language. Its platform supports English, Spanish, Portuguese, Polish, and Russian.'

export const MEMORY_LAYER_COMPARISON_GUARDRAIL =
  'When defining or comparing COS components, explain their purpose, scope, lifetime, and authority. Do not force incident-diagnostic observables, falsifiers, database wait events, or prompt examples into a conceptual answer unless the user asks for diagnosis or verification. When the user supplies multiple dated policy or context records, treat them as task premises: a later record with explicit scope or an effective-immediately directive supersedes conflicting older rules within that scope, while older rules remain only where they do not conflict. Never recommend an action that violates the controlling newer record unless the prompt explicitly supplies exception authority. When two supplied sources use the same KPI or business-metric label with different definitions, preserve the literal definitions and values instead of inventing semantic roles for them. Do not call one metric top-of-funnel, bottom-of-funnel, dormant, exploratory, converted, monetized, or otherwise characterize the populations unless the supplied facts establish that meaning. An arithmetic difference between two metric values is only a difference in counts; it does not prove cohort membership, a subset relationship, or what the gap represents. Never say that such a gap consists of active-but-not-billable users, free-tier users, trial users, non-core users, or any other user class unless the prompt explicitly establishes that cohort relationship. Do not label a ratio between the metrics as a conversion rate unless the numerator is established as a subset of the denominator for the same period and population. Do not infer an unstated business model such as freemium or usage-based, or claim effects on monetization potential, engagement, ecosystem size, churn, or growth merely from the metric discrepancy. For stakeholder or investor reporting, recommend a single canonical definition only when the prompt establishes which governance source has reporting authority; otherwise say that authority must be resolved before publication. Do not nominate the Board, CFO, Finance, Product, Investor Relations, or any other function as the metric authority unless the prompt explicitly assigns that authority; refer generically to the designated reporting owner or governance body. Until authority is resolved, present both values with explicit definitions and disclose the reconciliation. Any replacement labels such as Total Active Users or Billable Active Users must be clearly described as proposed labels, not as existing company terminology. Before finalizing a metric-reconciliation answer, remove or explicitly label as hypothesis every population characterization, causal explanation, business-model claim, or authority assignment that is not stated in the supplied facts.'


/** Detect when the recorded answer materially used a canonical COS definition. */
const SEMANTIC_MEMORY_FINGERPRINT = /meaning-based retrieval across durable COS knowledge and context/i
const CREATIVE_MEMORY_FINGERPRINT = /durable, validated memory of successful approaches/i
const ENTERPRISE_MEMORY_FINGERPRINT = /durable organization-scoped operational knowledge/i
const SEMANTIC_CACHE_FINGERPRINT = /policy-versioned, age-bounded reuse/i
const SIGNALBOOST_COMPANY_IDENTITY_FINGERPRINT = /privately owned U\.S\. AI platform/i
export type CanonicalSelfKnowledgeContribution = { semanticMemoryDefinition:boolean; creativeMemoryDefinition:boolean; enterpriseMemoryDefinition:boolean; semanticCacheDefinition:boolean; companyIdentityDefinition:boolean; used:boolean }
export function canonicalSelfKnowledgeContribution(answer:string):CanonicalSelfKnowledgeContribution {
  const text=String(answer ?? '')
  const semanticMemoryDefinition=SEMANTIC_MEMORY_FINGERPRINT.test(text)
  const creativeMemoryDefinition=CREATIVE_MEMORY_FINGERPRINT.test(text)
  const enterpriseMemoryDefinition=ENTERPRISE_MEMORY_FINGERPRINT.test(text)
  const semanticCacheDefinition=SEMANTIC_CACHE_FINGERPRINT.test(text)
  const companyIdentityDefinition=SIGNALBOOST_COMPANY_IDENTITY_FINGERPRINT.test(text)
  return {
    semanticMemoryDefinition,
    creativeMemoryDefinition,
    enterpriseMemoryDefinition,
    semanticCacheDefinition,
    companyIdentityDefinition,
    used:semanticMemoryDefinition || creativeMemoryDefinition || enterpriseMemoryDefinition || semanticCacheDefinition || companyIdentityDefinition,
  }
}
