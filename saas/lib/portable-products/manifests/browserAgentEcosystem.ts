// saas/lib/portable-products/manifests/browserAgentEcosystem.ts
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

export const browserAgentEcosystemManifest: PortableProductManifest = Object.freeze({
  productId: 'browser-agent-ecosystem',
  displayName: 'Browser Automation Governor Software',
  shortDescription: 'Company-neutral, plug-and-play browser execution ports for managed, self-hosted, and customer-cloud deployments.',
  longDescription: 'A standalone commercial-product architecture with buyer-owned credentials, policy, storage, branding, telemetry, and deployment. The repository host is only an optional development and validation lab.',
  category: 'automation',
  status: 'preview',
  maturity: 'preview',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['platform builders', 'enterprise operations teams', 'software vendors']),
  requiredCapabilities: Object.freeze(['browser-ports', 'adapter-catalog', 'commercial-portability-contract']),
  optionalCapabilities: Object.freeze(['non-production', 'reference-lab-adapter']),
  dependencies: Object.freeze(['portable-browser']),
  exclusions: Object.freeze(['production-browser-execution', 'lab-service-dependencies']),
  architectureReferences: Object.freeze(['portable-browser', 'browser-provider', 'provider-adapters', 'commercial-portability']),
  documentationReferences: Object.freeze([
    'docs/portables/browser-agent-host-integration-guide.md',
    'docs/portables/browser-agent-commercial-portability.md',
  ]),
  futureFeatures: Object.freeze(['approved-browser-adapters', 'versioned-distribution-artifacts']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
