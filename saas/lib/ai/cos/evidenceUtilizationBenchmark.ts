import type { PrivateBenchmarkCase } from '@/lib/ai/cos/capabilityBenchmarkRunner'

export type EvidenceUtilizationDomain =
  | 'sre'
  | 'postgres'
  | 'cloud'
  | 'networking'
  | 'security'
  | 'software'
  | 'ai_systems'
  | 'business_sales'
  | 'signalboost'

export type EvidenceUtilizationBenchmarkCase = PrivateBenchmarkCase & {
  domain: EvidenceUtilizationDomain
}

const c = (
  id: string,
  domain: EvidenceUtilizationDomain,
  prompt: string,
  requiredTerms: string[],
  forbiddenTerms: string[] = [],
): EvidenceUtilizationBenchmarkCase => ({
  id,
  domain,
  track: `evidence_utilization:${domain}`,
  prompt,
  requiredTerms,
  forbiddenTerms,
  requiresProvenance: true,
  requiresLocalReasoning: true,
})

/**
 * Controlled, non-held-out suite for accumulating retrieval/use/outcome evidence.
 *
 * These cases are intentionally separate from the six private capability-acceptance cases. Their
 * purpose is to create repeatable cohorts across domains so source_kind utilization, latency and
 * outcome correlations can be calibrated without changing the acceptance rotation or teaching COS
 * fixture answers. Rubrics are deliberately broad: this suite measures useful grounding behavior,
 * not narrow phrasing mastery.
 */
export const COS_EVIDENCE_UTILIZATION_BENCHMARK: readonly EvidenceUtilizationBenchmarkCase[] = [
  c('sre-tenant-500s', 'sre', 'Production health is green globally, but one customer reports intermittent 500 errors. Give a read-only investigation plan that separates tenant-specific failures from global failures.', ['logs', 'tenant'], ['restart everything']),
  c('sre-tail-latency', 'sre', 'A service has stable average latency but sharply worse tail latency during peak traffic. Explain what to inspect before changing capacity.', ['latency', 'dependency']),
  c('sre-queue-backlog', 'sre', 'A background processing queue is growing although producers look healthy. Give a safe diagnosis sequence.', ['queue', 'consumer']),
  c('sre-memory-pressure', 'sre', 'A container is occasionally killed for memory pressure without a recent deployment. Explain how to distinguish a leak from a workload spike.', ['memory', 'limit']),

  c('postgres-slow-query', 'postgres', 'A PostgreSQL query became slow after the table grew tenfold. Give the safest investigation sequence before changing indexes.', ['explain', 'index']),
  c('postgres-lock-contention', 'postgres', 'Users report intermittent database timeouts and monitoring shows lock waits. Explain how to identify the blocking workload safely.', ['lock', 'transaction']),
  c('postgres-pool-exhaustion', 'postgres', 'An application intermittently fails to obtain PostgreSQL connections while the database CPU is moderate. Diagnose the likely connection-pool path.', ['connection', 'pool']),
  c('postgres-bloat-vacuum', 'postgres', 'A PostgreSQL table is much larger than expected and updates are slowing down. Explain how vacuum behavior and bloat should be investigated before maintenance.', ['vacuum', 'bloat']),

  c('cloud-regional-asymmetry', 'cloud', 'Only one cloud region shows elevated errors while the application version is identical everywhere. Give a read-only isolation plan.', ['region', 'dependency']),
  c('cloud-object-storage-403', 'cloud', 'A workload suddenly gets 403 responses from object storage without a code deploy. Explain what identity and permission evidence to inspect.', ['permission', 'identity']),
  c('cloud-serverless-timeout', 'cloud', 'A serverless API intermittently reaches its execution timeout although its health endpoint is fast. Give a low-risk diagnosis plan.', ['timeout', 'dependency']),
  c('cloud-stale-cache', 'cloud', 'Users in one geography see stale application data while origin data is current. Explain how to isolate cache behavior before purging anything.', ['cache', 'invalidation']),

  c('networking-dns-intermittent', 'networking', 'Clients intermittently fail name resolution while direct IP connectivity works. Give a diagnostic sequence that avoids changing DNS prematurely.', ['dns', 'resolver']),
  c('networking-packet-loss', 'networking', 'An application has sporadic request failures and path monitoring suggests packet loss. Explain how to localize the failing hop or segment.', ['packet', 'loss']),
  c('networking-tls-handshake', 'networking', 'One client population cannot complete TLS handshakes while others can. Explain what certificate and protocol evidence to compare.', ['certificate', 'tls']),
  c('networking-route-asymmetry', 'networking', 'Traffic to the same service follows different network paths from two sites and only one path is unreliable. Explain how to diagnose routing asymmetry.', ['route', 'path']),

  c('security-suspicious-login', 'security', 'Several suspicious account logins were detected. Give a defensive investigation plan that preserves evidence before containment.', ['evidence', 'contain']),
  c('security-secret-exposure', 'security', 'A production API secret may have appeared in a log. Describe the immediate defensive sequence without destroying audit evidence.', ['rotate', 'audit']),
  c('security-phishing-endpoint', 'security', 'A user opened a suspected phishing attachment. Give a defensive response sequence that minimizes spread while preserving evidence.', ['isolate', 'evidence']),
  c('security-vulnerability-patch', 'security', 'A critical dependency vulnerability is announced but exploitation is not confirmed. Explain a safe patch and verification plan.', ['patch', 'rollback']),

  c('software-flaky-test', 'software', 'A test passes locally but fails intermittently in CI. Explain how to isolate whether timing, shared state, or environment is responsible.', ['test', 'isolate']),
  c('software-deploy-regression', 'software', 'Error rates increased after a deployment. Give a verification and rollback decision sequence that preserves diagnostic evidence.', ['rollback', 'logs']),
  c('software-schema-migration', 'software', 'A database schema change must be released with zero downtime. Explain the compatibility strategy for old and new application versions.', ['migration', 'backward']),
  c('software-concurrency-race', 'software', 'A rare duplicate-write bug appears only under concurrency. Explain how to reproduce and diagnose the race safely.', ['race', 'reproduce']),

  c('ai-rag-conflict', 'ai_systems', 'Two retrieved sources disagree about a policy. Explain how a grounded assistant should answer without inventing certainty.', ['source', 'uncertainty']),
  c('ai-embedding-migration', 'ai_systems', 'A vector store keeps the same embedding dimension after changing embedding models, but retrieval quality collapses. Explain why.', ['embedding', 'model']),
  c('ai-citation-hallucination', 'ai_systems', 'A RAG assistant occasionally emits citation labels that were never supplied. Explain how the system should verify citations.', ['citation', 'verify']),
  c('ai-evaluation-regression', 'ai_systems', 'A new reasoning change improves demo answers but lowers a private evaluation score. Explain how holdout evidence should guide the release decision.', ['benchmark', 'holdout']),

  c('business-stalled-pipeline', 'business_sales', 'A sales pipeline has the same lead volume but fewer closed deals. Explain how to locate the conversion drop before changing lead generation.', ['pipeline', 'conversion']),
  c('business-campaign-response', 'business_sales', 'An outreach campaign has a low reply rate. Explain how to test whether targeting, message, or channel is responsible.', ['segment', 'measure']),
  c('business-crm-duplicates', 'business_sales', 'A CRM accumulates duplicate contacts from multiple integrations. Explain a safe deduplication approach that preserves provenance.', ['deduplicate', 'source']),
  c('business-lead-scoring', 'business_sales', 'A lead score predicts clicks but not revenue. Explain how the scoring system should be recalibrated against downstream outcomes.', ['score', 'outcome']),

  c('signalboost-memory-vs-cache', 'signalboost', 'What is the difference between SignalBoost Enterprise Memory and Semantic Cache?', ['memory', 'cache']),
  c('signalboost-learning-admission', 'signalboost', 'A learned item is below the durable promotion band. State the probationary rule and what is required before durable promotion.', ['probationary', 'corroboration']),
  c('signalboost-external-ai', 'signalboost', 'When should COS use an external AI provider relative to its own primary reasoner and internal knowledge?', ['external', 'last resort']),
  c('signalboost-vector-space', 'signalboost', 'Why must COS track embedding model identity when migrating a 768-dimensional vector store?', ['embedding', 'model']),
] as const

export function evidenceUtilizationDomains(): EvidenceUtilizationDomain[] {
  return [...new Set(COS_EVIDENCE_UTILIZATION_BENCHMARK.map(test => test.domain))]
}
