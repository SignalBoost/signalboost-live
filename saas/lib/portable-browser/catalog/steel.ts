// saas/lib/portable-browser/catalog/steel.ts
import { freezePortableBrowserAdapterDescriptor } from '../browser-adapter-descriptor.ts'

export const steelDescriptor = freezePortableBrowserAdapterDescriptor({
  adapterId: 'steel',
  displayName: 'Steel',
  category: 'session_infrastructure',
  implementationStatus: 'available',
  runtimeLanguages: ['typescript', 'rest'],
  deploymentModels: ['managed_cloud', 'self_hosted'],
  supportedPortKinds: ['session', 'evidence', 'telemetry', 'human_control', 'credential'],
  declaredCapabilities: ['structured_actions'],
  authenticationModes: ['buyer_managed', 'opaque_grant'],
  observabilityCapabilities: ['audit_events'],
  humanControlCapabilities: ['exclusive_takeover'],
  evidenceCapabilities: ['replay_reference'],
  complianceMetadataKeys: ['tenant_isolation', 'approved_origins'],
  configurationFieldDefinitions:[{key:'apiBaseUrl',type:'url',required:true,description:'Steel API base URL used to create and release sessions.'},{key:'connectOrigin',type:'url',required:true,description:'Steel connect origin the session websocket is opened against.'},{key:'credentialReference',type:'opaque_reference',required:true,description:'Vault reference resolving to the Steel API key. Supply a reference, never the secret itself.'},{key:'approvedOrigins',type:'string',required:true,description:'Comma-separated origins the session is permitted to visit. Anything else is refused.'}],
  documentationReference: 'docs/portables/browser-agent-adapter-catalog.md',
  vendorDependencyInstalled: false,
  productionEnabled: false,
})
