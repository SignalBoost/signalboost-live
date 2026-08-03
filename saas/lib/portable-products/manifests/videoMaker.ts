// saas/lib/portable-products/manifests/videoMaker.ts
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

export const videoMakerManifest: PortableProductManifest = Object.freeze({
  productId: 'video-maker',
  displayName: 'Video Maker Software',
  shortDescription: 'Voice and branded video with governed prepaid use.',
  longDescription: 'A portable media workflow for creating branded video artifacts with human approval retained before publishing.',
  category: 'media',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['marketing teams', 'content teams']),
  requiredCapabilities: Object.freeze(['video-rendering', 'human-approval']),
  optionalCapabilities: Object.freeze(['voice', 'captions']),
  dependencies: Object.freeze(['approved-media-provider']),
  exclusions: Object.freeze(['unapproved-publishing']),
  architectureReferences: Object.freeze(['render-core', 'render-host']),
  documentationReferences: Object.freeze(['docs/portables/render-module.md']),
  futureFeatures: Object.freeze(['package-presets']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
