import type { PortableProductManifest } from '../manifestTypes.ts'

export const browserAgentEcosystemManifest: PortableProductManifest = Object.freeze({
  productId: 'browser-agent-ecosystem',
  displayName: 'Browser Agent Ecosystem',
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
