// saas/lib/portable-products/manifests/agentOperationsPlatform.ts
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

export const agentOperationsPlatformManifest: PortableProductManifest = Object.freeze({
  productId: 'agent-operations-platform',
  displayName: 'Agent Operations Platform Software',
  shortDescription: 'Guarded workflows with quotas, audit, idempotency, recovery, and provider-neutral adapters.',
  longDescription: 'A governed operations platform for durable agent workflows, recovery, auditability, and provider-neutral coordination.',
  category: 'operations',
  status: 'preview',
  maturity: 'preview',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['enterprise operations teams', 'platform builders']),
  requiredCapabilities: Object.freeze(['durable-workflows', 'audit', 'idempotency']),
  optionalCapabilities: Object.freeze(['recovery']),
  dependencies: Object.freeze(['workflow-coordinator']),
  exclusions: Object.freeze(['unguarded-provider-execution']),
  architectureReferences: Object.freeze(['agent-runtime', 'workflow-coordinator', 'durable-execution']),
  documentationReferences: Object.freeze(['docs/portables/enterprise-portables-and-blank-cos.md']),
  futureFeatures: Object.freeze(['enterprise-catalog-listing']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
