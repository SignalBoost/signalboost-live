import { freezePortableBrowserAdapterDescriptor } from '../browser-adapter-descriptor.ts'

export const browserlessDescriptor = freezePortableBrowserAdapterDescriptor({
  adapterId: 'browserless',
  displayName: 'Browserless',
  category: 'session_infrastructure',
  implementationStatus: 'available',
  runtimeLanguages: ['typescript', 'websocket'],
  deploymentModels: ['managed_cloud', 'self_hosted'],
  supportedPortKinds: ['session', 'evidence', 'telemetry', 'human_control', 'credential'],
  declaredCapabilities: ['structured_actions'],
  authenticationModes: ['buyer_managed', 'opaque_grant'],
  observabilityCapabilities: ['audit_events'],
  humanControlCapabilities: ['exclusive_takeover'],
  evidenceCapabilities: ['replay_reference'],
  complianceMetadataKeys: ['tenant_isolation', 'approved_origins'],
  configurationFieldDefinitions: [],
  documentationReference: 'docs/portables/browser-agent-adapter-catalog.md',
  vendorDependencyInstalled: false,
  productionEnabled: false,
})
