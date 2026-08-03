// saas/lib/portable-products/manifests/portableChiefOfStaff.ts
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

export const portableChiefOfStaffManifest: PortableProductManifest = Object.freeze({
  productId: 'portable-ai-chief-of-staff',
  displayName: 'AI Chief of Staff Software',
  shortDescription: 'Plans and carries out only approved work through buyer-supplied ports.',
  longDescription: 'A portable planning layer designed to coordinate approved work through buyer-supplied ports while preserving human control.',
  category: 'operations',
  status: 'preview',
  maturity: 'preview',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['business owners', 'operations teams']),
  requiredCapabilities: Object.freeze(['planning', 'approval-gates']),
  optionalCapabilities: Object.freeze(['buyer-supplied-ports']),
  dependencies: Object.freeze(['portable-kernel']),
  exclusions: Object.freeze(['autonomous-consequential-actions']),
  architectureReferences: Object.freeze(['COS', 'portable-kernel']),
  documentationReferences: Object.freeze(['docs/portables/cos-host-integration-guide.md']),
  futureFeatures: Object.freeze(['licensing-activation']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
