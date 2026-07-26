// saas/lib/portable-browser/catalog/playwright.ts
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
  configurationFieldDefinitions:[{key:'engine',type:'enum',required:true,description:'Browser engine the local runtime launches.',options:['chromium','firefox','webkit']},{key:'headless',type:'boolean',required:false,description:'Whether the local browser runs headless. Defaults to headless in server environments.'},{key:'executablePath',type:'string',required:false,description:'Optional path to a browser binary, for buyers pinning an approved build.'},{key:'approvedOrigins',type:'string',required:true,description:'Comma-separated origins the session is permitted to visit. Anything else is refused.'}],
  documentationReference: 'docs/portables/browser-agent-adapter-catalog.md',
  vendorDependencyInstalled: false,
  productionEnabled: false,
})
