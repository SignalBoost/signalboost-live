import type { PortableProductManifest } from '../manifestTypes.ts'

export const agentOperationsPlatformManifest: PortableProductManifest = Object.freeze({
  productId: 'agent-operations-platform',
  displayName: 'Agent Operations Platform',
  shortDescription: 'Guarded workflows with quotas, audit, idempotency, recovery, and provider-neutral adapters.',
  longDescription: 'A governed operations platform for durable agent workflows, recovery, auditability, and provider-neutral coordination.',
  category: 'operations',
  status: 'preview',
  maturity: 'preview',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['enterprise operations teams', 'platform builders']),
  requiredCapabilities: Object.freeze(['durable-workflows', 'audit', 'idempotency']),
  optionalCapabilities: Object.freeze(['recovery']),
  dependencies: Object.freeze(['workflow-coordinator']),
  exclusions: Object.freeze(['unguarded-provider-execution']),
  architectureReferences: Object.freeze(['agent-runtime', 'workflow-coordinator', 'durable-execution']),
  documentationReferences: Object.freeze(['docs/portables/enterprise-portables-and-blank-cos.md']),
  futureFeatures: Object.freeze(['enterprise-catalog-listing']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})