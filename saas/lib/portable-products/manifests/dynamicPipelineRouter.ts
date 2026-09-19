import type { PortableProductManifest } from '../manifestTypes.ts'

export const dynamicPipelineRouterManifest: PortableProductManifest = Object.freeze({
  productId: 'dynamic-pipeline-router',
  displayName: 'Dynamic Pipeline Router Software',
  shortDescription: 'Routes incoming work to compatible healthy capacity instead of waiting for one fixed provider or pipeline.',
  longDescription: 'A provider-neutral workload router for AI and automation systems. It consumes capability and health metadata, ranks compatible pipelines by availability, buyer preference, failure rate, current load, queue depth, cost, and latency, and supports lease-aware claiming without owning credentials, approvals, provider registration, or execution.',
  categoryLabel: 'Dynamic workload routing and orchestration software',
  category: 'infrastructure',
  status: 'preview',
  maturity: 'beta',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['AI platform teams', 'automation teams', 'enterprise technology teams', 'software vendors']),
  requiredCapabilities: Object.freeze(['capability-based-routing', 'health-aware-selection', 'capacity-aware-selection', 'deterministic-rerouting', 'lease-port']),
  optionalCapabilities: Object.freeze(['provider-hub-discovery', 'cost-aware-routing', 'latency-aware-routing', 'queue-depth-routing', 'buyer-provider-preferences']),
  dependencies: Object.freeze(['provider-hub', 'workflow-coordinator']),
  exclusions: Object.freeze(['provider-secret-storage', 'parallel-provider-registry', 'automatic-approval', 'ungoverned-execution', 'automatic-authority-expansion']),
  architectureReferences: Object.freeze(['saas/lib/dynamic-pipeline-router', 'provider-hub-core', 'workflow-coordinator']),
  documentationReferences: Object.freeze(['docs/portables/dynamic-pipeline-router.md']),
  futureFeatures: Object.freeze(['buyer-host-durable-lease-adapter', 'router-telemetry-ledger', 'cross-product-routing-console', 'licensing-activation']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
