// saas/lib/portable-products/manifests/integrationsHub.ts
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

export const integrationsHubManifest: PortableProductManifest = Object.freeze({
  productId: 'integrations-hub',
  displayName: 'Integrations Hub Software',
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
