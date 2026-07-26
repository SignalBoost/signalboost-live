// saas/lib/portable-browser/catalog/browserless.ts
import { freezePortableBrowserAdapterDescriptor } from '../browser-adapter-descriptor.ts'

export const browserlessDescriptor = freezePortableBrowserAdapterDescriptor({
  adapterId: 'browserless',
  displayName: 'Browserless',
  category: 'session_infrastructure',
  implementationStatus: 'available',
  runtimeLanguages: ['typescript'],
  deploymentModels: ['managed_cloud', 'self_hosted'],
  supportedPortKinds: ['session', 'evidence', 'telemetry', 'human_control', 'credential'],
  declaredCapabilities: ['structured_actions'],
  authenticationModes: ['buyer_managed', 'opaque_grant'],
  observabilityCapabilities: ['audit_events'],
  humanControlCapabilities: ['exclusive_takeover'],
  evidenceCapabilities: ['replay_reference'],
  complianceMetadataKeys: ['tenant_isolation', 'approved_origins'],
  configurationFieldDefinitions:[{key:'endpoint',type:'url',required:true,description:'Browserless websocket endpoint the session connects to (wss). The shipped adapter accepts /, /chromium, /chrome or /chromium/playwright.'},{key:'credentialReference',type:'opaque_reference',required:true,description:'Vault reference resolving to the Browserless token. Supply a reference, never the secret itself.'},{key:'approvedOrigins',type:'string',required:true,description:'Comma-separated origins the session is permitted to visit. Anything else is refused.'}],
  documentationReference: 'docs/portables/browser-agent-adapter-catalog.md',
  vendorDependencyInstalled: false,
  productionEnabled: false,
})
