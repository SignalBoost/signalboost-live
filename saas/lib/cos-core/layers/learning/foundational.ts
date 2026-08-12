import type { KnowledgeGap } from './index'

export type FoundationalKnowledgeDomain = {
  id: string
  subject: string
  questions: string[]
}

// Broad, reusable study curriculum. These are questions, not embedded answers: live source
// adapters must acquire provenance-bearing evidence before anything is admitted as knowledge.
export const FOUNDATIONAL_KNOWLEDGE_DOMAINS: FoundationalKnowledgeDomain[] = [
  { id:'sre', subject:'site reliability engineering distributed systems incident diagnosis', questions:[
    'How should an SRE diagnose tail-latency regressions when aggregate CPU, memory and traffic remain normal?',
    'What architectural patterns cause tenant-specific latency in multi-tenant SaaS systems?',
    'How do queues, retries, backpressure, saturation, load shedding and timeout budgets interact in distributed systems?',
    'How should traces, RED metrics, USE metrics and service-level objectives be used to distinguish latency causes without production mutation?',
  ]},
  { id:'postgres', subject:'PostgreSQL database performance multi tenant SaaS', questions:[
    'How do PostgreSQL query plans, statistics, indexes, row-level security and data skew affect large tenants differently from small tenants?',
    'How can pg_stat_statements, pg_stat_activity, wait events and buffer statistics distinguish query execution from pool wait latency?',
    'What causes connection-pool starvation, idle-in-transaction sessions and transaction contention?',
    'How should EXPLAIN and read-only observability be used safely to diagnose production PostgreSQL performance?',
  ]},
  { id:'cloud', subject:'cloud architecture containers Kubernetes serverless reliability', questions:[
    'What failure modes in Kubernetes, serverless and container platforms create latency without obvious aggregate resource saturation?',
    'How do autoscaling, cold starts, noisy neighbors, network paths, DNS and service meshes affect tail latency?',
    'How should AWS Azure and GCP observability be used to isolate application network database and dependency latency?',
  ]},
  { id:'networking', subject:'networking DNS TLS HTTP API performance', questions:[
    'How do DNS TLS connection reuse HTTP versions proxies gateways CDNs and load balancers contribute to API tail latency?',
    'How can network latency packet loss retransmission and connection establishment be diagnosed read-only?',
  ]},
  { id:'security', subject:'cybersecurity identity access SaaS security', questions:[
    'What secure architecture principles apply to multi-tenant SaaS identity authorization tenant isolation secrets and auditability?',
    'How can SSO SAML OAuth OIDC policy evaluation and audit middleware create tenant-specific latency?',
    'What are the current defensive practices for cloud application API and supply-chain security?',
  ]},
  { id:'software', subject:'software engineering architecture APIs ORM performance', questions:[
    'How do N plus one queries ORM loading patterns serialization middleware and synchronous dependencies create scale-dependent latency?',
    'What software architecture patterns improve resilience observability testability and safe failure handling?',
  ]},
  { id:'ai', subject:'artificial intelligence LLM inference retrieval augmented generation agents', questions:[
    'What architectures make retrieval augmented generation reliable measurable and provenance preserving?',
    'How should semantic caches embeddings reranking knowledge graphs confidence gates and model routing work together?',
    'What are effective methods for evaluating local open-model reasoning quality and reducing external model dependence?',
  ]},
  { id:'business', subject:'business strategy enterprise SaaS economics operations', questions:[
    'What durable principles govern enterprise SaaS pricing unit economics retention procurement security review and adoption?',
    'How should AI software demonstrate measurable ROI governance and buyer control to enterprise customers?',
  ]},
  { id:'sales', subject:'B2B enterprise sales marketing revenue operations', questions:[
    'What evidence-based practices improve B2B enterprise prospecting qualification outreach pipeline conversion and retention?',
    'How should marketing attribution experimentation lifecycle messaging and revenue operations be measured?',
  ]},
]

export function foundationalKnowledgeGaps(): KnowledgeGap[] {
  return FOUNDATIONAL_KNOWLEDGE_DOMAINS.flatMap(domain => domain.questions.map((question,index) => ({
    id:`foundational:${domain.id}:${index + 1}`,
    subject:domain.subject,
    question,
    portableIds:['cos'],
    expectedReuse:100,
    expectedAvoidedCostUsd:10,
    urgency:90,
    evidence:['SignalBoost foundational COS curriculum; acquisition must come from approved provenance-bearing sources.'],
  })))
}

const DOMAIN_STOP_WORDS = new Set(['about','because','been','from','have','into','more','only','over','than','that','their','them','then','there','these','they','this','what','when','where','which','while','with','your'])

function terms(text: string): string[] {
  return [...new Set(
    String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}-]+/u)
      .map(word => word.replace(/^-+|-+$/g, '').trim())
      .filter(word => word.length >= 4 && !DOMAIN_STOP_WORDS.has(word)),
  )]
}

/**
 * Map a free-text question onto the curriculum domain it belongs to.
 *
 * Knowledge gaps recorded from live chat used to take their subject straight from the user's
 * words, which produced study subjects like "multi-tenant saas suddenly shows" — a truncated copy
 * of one benchmark question. Those became the search terms for every source adapter and the match
 * key for retrieval, so a gap could never line up with the curriculum that was meant to answer it.
 * Anchoring to a domain subject fixes both: acquisition searches a real topic, and gaps about the
 * same subject collapse onto one row instead of one per phrasing.
 *
 * Returns null when nothing matches well enough, so the caller can fall back rather than file a
 * question under a domain it has nothing to do with.
 */
export function nearestFoundationalSubject(text: string, minimumOverlap = 2): string | null {
  const wanted = terms(text)
  if (!wanted.length) return null
  let best: { subject: string; score: number } | null = null
  for (const domain of FOUNDATIONAL_KNOWLEDGE_DOMAINS) {
    const domainTerms = terms(`${domain.subject} ${domain.questions.join(' ')}`)
    const subjectTerms = new Set(terms(domain.subject))
    const score = wanted.reduce((total, word) => total + (subjectTerms.has(word) ? 2 : domainTerms.includes(word) ? 1 : 0), 0)
    if (score >= minimumOverlap && (!best || score > best.score)) best = { subject: domain.subject, score }
  }
  return best?.subject ?? null
}
