import type { PortableProductManifest } from '../manifestTypes.ts'

export const providerHubManifest: PortableProductManifest = Object.freeze({
  productId: 'provider-hub',
  displayName: 'Provider Hub',
  shortDescription: 'Connect your own AI and business provider accounts through one governed workspace.',
  longDescription: 'A provider-neutral BYOK and BYOI product for individual users, teams, and enterprises to connect and manage buyer-owned provider resources for authorized SignalBoost applications and portable products.',
  category: 'integrations',
  status: 'preview',
  maturity: 'preview',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['individual users', 'creators', 'small businesses', 'enterprises', 'platform teams', 'regulated organizations', 'software vendors']),
  requiredCapabilities: Object.freeze(['provider-registration', 'tenant-isolation', 'secret-redaction', 'approval-gates']),
  optionalCapabilities: Object.freeze(['vault-integration', 'oauth', 'service-accounts', 'health-monitoring', 'quota-monitoring']),
  dependencies: Object.freeze(['buyer-supplied-provider-account', 'buyer-supplied-credentials', 'approved-vault-host']),
  exclusions: Object.freeze(['secret-exposure', 'automatic-approval', 'unbounded-spend', 'provider-mutation-without-approval']),
  architectureReferences: Object.freeze(['provider-hub-core', 'provider-hub-host', 'universal-provider-framework', 'portable-product-doctrine', 'console-hub']),
  documentationReferences: Object.freeze([
    'docs/portables/provider-hub-byok-portable.md',
    'docs/portables/provider-hub-existing-assets-inventory.md',
    'saas/provider-hub-core/index.ts',
    'saas/provider-hub-host/contracts.ts',
    'saas/docs/provider-integration.md',
  ]),
  futureFeatures: Object.freeze(['dedicated-self-service-provider-hub', 'enterprise-admin-console', 'white-label-packaging', 'licensing-enforcement']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
