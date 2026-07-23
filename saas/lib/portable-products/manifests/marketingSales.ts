import type { PortableProductManifest } from '../manifestTypes.ts'

export const marketingSalesManifest: PortableProductManifest = Object.freeze({
  productId: 'marketing-sales',
  displayName: 'Marketing + Sales',
  shortDescription: 'Marketing and sales workflows in one portable engine.',
  longDescription: 'A governed engine for marketing and sales workflows that keeps customer-facing campaigns separate from implementation architecture.',
  category: 'growth',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['sales teams', 'marketing teams']),
  requiredCapabilities: Object.freeze(['marketing-workflows', 'sales-workflows']),
  optionalCapabilities: Object.freeze(['approval-gates']),
  dependencies: Object.freeze(['configured-workflow-host']),
  exclusions: Object.freeze(['guaranteed-business-outcomes']),
  architectureReferences: Object.freeze(['marketing-sales-core', 'marketing-sales-host']),
  documentationReferences: Object.freeze(['saas/docs/marketing-sales-module-design.md']),
  futureFeatures: Object.freeze(['catalog-templates']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})