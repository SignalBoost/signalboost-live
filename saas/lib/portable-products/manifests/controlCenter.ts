// saas/lib/portable-products/manifests/controlCenter.ts
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

export const controlCenterManifest: PortableProductManifest = Object.freeze({
  productId: 'control-center',
  displayName: 'Control Center Software',
  shortDescription: 'Keys, webhooks, logs, releases, and activity controls.',
  longDescription: 'A governed operational console for cataloged provider actions, audit visibility, and human-controlled releases.',
  category: 'governance',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['platform administrators', 'operators']),
  requiredCapabilities: Object.freeze(['audit-logs', 'release-controls']),
  optionalCapabilities: Object.freeze(['key-management']),
  dependencies: Object.freeze(['operator-approval']),
  exclusions: Object.freeze(['secret-values-in-metadata']),
  architectureReferences: Object.freeze(['console-core', 'console-host']),
  documentationReferences: Object.freeze(['saas/docs/console/TESTING.md']),
  futureFeatures: Object.freeze(['enterprise-catalog']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
