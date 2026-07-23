import type { PortableProductManifest } from '../manifestTypes.ts'

export const integrationsHubManifest: PortableProductManifest = Object.freeze({
  productId: 'integrations-hub',
  displayName: 'Integrations Hub',
  shortDescription: 'Secure connections for websites, payments, calendars, AI systems, and APIs.',
  longDescription: 'A provider-neutral catalog for governed integration configuration and operational discovery.',
  category: 'integrations',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['operations teams', 'platform administrators']),
  requiredCapabilities: Object.freeze(['provider-catalog', 'configuration']),
  optionalCapabilities: Object.freeze(['approval-gates']),
  dependencies: Object.freeze(['buyer-supplied-provider-accounts']),
  exclusions: Object.freeze(['credential-storage-in-manifest']),
  architectureReferences: Object.freeze(['universal-provider-framework', 'integration-catalog']),
  documentationReferences: Object.freeze(['saas/docs/provider-integration.md']),
  futureFeatures: Object.freeze(['marketplace-listing']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})