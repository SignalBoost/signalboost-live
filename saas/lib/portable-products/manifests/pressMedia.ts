// saas/lib/portable-products/manifests/pressMedia.ts
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

export const pressMediaManifest: PortableProductManifest = Object.freeze({
  productId: 'press-media',
  displayName: 'Press & Media Engine Software',
  shortDescription: 'Governed outreach to verified editors and paid distribution services.',
  longDescription: 'A press workflow that prepares outreach and retains owner approval before any external dispatch.',
  category: 'media',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['communications teams', 'agencies']),
  requiredCapabilities: Object.freeze(['press-outreach', 'owner-approval']),
  optionalCapabilities: Object.freeze(['distribution']),
  dependencies: Object.freeze(['approved-dispatch-workflow']),
  exclusions: Object.freeze(['dispatch-without-owner-approval']),
  architectureReferences: Object.freeze(['press-media-core', 'press-media-host']),
  documentationReferences: Object.freeze(['docs/portables/press-media-portable-design.md']),
  futureFeatures: Object.freeze(['marketplace-distribution-connectors']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
