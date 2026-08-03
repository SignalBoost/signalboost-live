// saas/lib/portable-products/manifests/providerHub.ts
//
// DISPLAY NAME CARRIES "Software" ON PURPOSE, Aug 2 2026. The owner's decision, and it is a
// commercial one rather than a cosmetic one: "portable" describes how we BUILD these — one
// boundary-proven package a buyer installs — and says nothing about what they are buying. To a
// buyer it reads as temporary or mobile. Every buyer-facing surface now names the product and
// the category in the same string, because that is what a person searches for and what a
// procurement form asks for.
//
// The displayName here is CANONICAL. The homepage renders its own localized names from
// lib/i18n/homepageLocales.json and they must match this one; anything else means a buyer sees
// two names for one product between a card and a document.
//
// "Enterprise" is deliberately NOT in any name — it is an EDITION, not an identity. The
// standing policy is Fortune 500 AND SMB, and a name a small buyer feels excluded by cannot be
// discounted later.
import type { PortableProductManifest } from '../manifestTypes.ts'

export const providerHubManifest: PortableProductManifest = Object.freeze({
  productId: 'provider-hub',
  displayName: 'Provider Connection Hub Software',
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
