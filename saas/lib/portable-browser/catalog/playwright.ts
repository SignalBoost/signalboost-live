import { freezePortableBrowserAdapterDescriptor } from '../browser-adapter-descriptor.ts'

export const playwrightDescriptor = freezePortableBrowserAdapterDescriptor({
  adapterId: 'playwright',
  displayName: 'Playwright Local',
  category: 'session_infrastructure',
  implementationStatus: 'available',
  runtimeLanguages: ['typescript'],
  deploymentModels: ['self_hosted'],
  supportedPortKinds: ['session', 'evidence', 'telemetry'],
  declaredCapabilities: ['structured_actions'],
  authenticationModes: ['buyer_managed'],
  observabilityCapabilities: ['audit_events'],
  humanControlCapabilities: [],
  evidenceCapabilities: ['replay_reference'],
  complianceMetadataKeys: ['tenant_isolation', 'approved_origins'],
  configurationFieldDefinitions: [],
  documentationReference: 'docs/portables/browser-agent-adapter-catalog.md',
  vendorDependencyInstalled: false,
  productionEnabled: false,
})
