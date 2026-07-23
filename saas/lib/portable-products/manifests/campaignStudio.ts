import type { PortableProductManifest } from '../manifestTypes.ts'

export const campaignStudioManifest: PortableProductManifest = Object.freeze({
  productId: 'campaign-studio',
  displayName: 'Campaign Studio',
  shortDescription: 'One short request becomes a finished campaign.',
  longDescription: 'A governed campaign workspace that creates campaign assets while preserving human approval for consequential actions.',
  category: 'growth',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['growth teams', 'agencies']),
  requiredCapabilities: Object.freeze(['campaign-generation', 'approval-gates']),
  optionalCapabilities: Object.freeze(['byok']),
  dependencies: Object.freeze(['buyer-supplied-ai-key']),
  exclusions: Object.freeze(['publishing-without-approval']),
  architectureReferences: Object.freeze(['cosa', 'agency']),
  documentationReferences: Object.freeze(['saas/docs/developer-guide.md']),
  futureFeatures: Object.freeze(['licensing-packaging']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})