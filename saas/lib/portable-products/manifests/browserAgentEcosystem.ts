import type { PortableProductManifest } from '../manifestTypes.ts'

export const browserAgentEcosystemManifest: PortableProductManifest = Object.freeze({
  productId: 'browser-agent-ecosystem',
  displayName: 'Browser Agent Ecosystem',
  shortDescription: 'Plug-and-play ports pre-staged for managed, self-hosted, and future browser-agent stacks.',
  longDescription: 'A metadata-first browser-agent compatibility ecosystem that remains non-production until governed adapters are available.',
  category: 'automation',
  status: 'preview',
  maturity: 'preview',
  publicVisible: true,
  licensingAvailable: false,
  targetAudience: Object.freeze(['platform builders', 'enterprise operations teams']),
  requiredCapabilities: Object.freeze(['browser-ports', 'adapter-catalog']),
  optionalCapabilities: Object.freeze(['non-production']),
  dependencies: Object.freeze(['portable-browser']),
  exclusions: Object.freeze(['production-browser-execution']),
  architectureReferences: Object.freeze(['portable-browser', 'browser-provider', 'provider-adapters']),
  documentationReferences: Object.freeze(['docs/portables/browser-agent-host-integration-guide.md']),
  futureFeatures: Object.freeze(['approved-browser-adapters']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})