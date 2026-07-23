import type { PortableProductManifest } from '../manifestTypes.ts'

export const pressMediaManifest: PortableProductManifest = Object.freeze({
  productId: 'press-media',
  displayName: 'Press & Media',
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