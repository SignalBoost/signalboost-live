import type { PortableProductManifest } from '../manifestTypes.ts'

export const controlCenterManifest: PortableProductManifest = Object.freeze({
  productId: 'control-center',
  displayName: 'Control Center',
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