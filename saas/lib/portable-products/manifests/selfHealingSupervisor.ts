import type { PortableProductManifest } from '../manifestTypes.ts'

export const selfHealingSupervisorManifest: PortableProductManifest = Object.freeze({
  productId: 'self-healing-supervisor',
  displayName: 'Self-Healing Supervisor',
  shortDescription: 'Detects failures, diagnoses them, and proposes bounded repairs for approval.',
  longDescription: 'A governed supervisor that detects failures and prepares bounded repair proposals without bypassing human approval.',
  category: 'infrastructure',
  status: 'preview',
  maturity: 'preview',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['platform operators', 'reliability teams']),
  requiredCapabilities: Object.freeze(['failure-detection', 'repair-proposals']),
  optionalCapabilities: Object.freeze(['approval-gates']),
  dependencies: Object.freeze(['supervisor-policy']),
  exclusions: Object.freeze(['autonomous-production-repair']),
  architectureReferences: Object.freeze(['supervisor', 'policy-engine', 'durable-coordination']),
  documentationReferences: Object.freeze(['docs/portables/self-healing-integration-guide.md']),
  futureFeatures: Object.freeze(['operator-catalog']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})