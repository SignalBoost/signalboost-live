// saas/lib/portable-browser/catalog/playwright-mcp.ts
import { freezePortableBrowserAdapterDescriptor } from '../browser-adapter-descriptor.ts'

export const playwright_mcpDescriptor = freezePortableBrowserAdapterDescriptor({
  adapterId: 'playwright-mcp',
  displayName: 'Playwright MCP',
  category: 'agent_loop',
  implementationStatus: 'host_adapter_required',
  runtimeLanguages: ['typescript', 'mcp'],
  deploymentModels: ['local', 'self_hosted', 'hybrid'],
  supportedPortKinds: ['agent_loop'],
  declaredCapabilities: [
    'navigation',
    'accessibility_snapshot',
    'console_inspection',
    'network_inspection',
    'screenshot',
    'bounded_interaction',
  ],
  authenticationModes: ['buyer_managed', 'opaque_grant'],
  observabilityCapabilities: ['audit_events', 'console_messages', 'network_requests'],
  humanControlCapabilities: [],
  evidenceCapabilities: ['screenshots', 'accessibility_snapshots'],
  complianceMetadataKeys: ['tenant_isolation', 'approved_origins', 'mcp_transport'],
  configurationFieldDefinitions: [
    {
      key: 'transportRef',
      type: 'string',
      required: true,
      description: 'Host-owned logical transport reference for the stdio Playwright MCP process.',
    },
    {
      key: 'credentialReference',
      type: 'opaque_reference',
      required: false,
      description: 'Optional vault reference when the host-side MCP process requires authentication.',
    },
    {
      key: 'approvedOrigins',
      type: 'string',
      required: true,
      description: 'Comma-separated exact origins the governed host permits this browser session to visit.',
    },
  ],
  documentationReference: 'docs/portables/browser-agent-adapter-catalog.md',
  vendorDependencyInstalled: false,
  productionEnabled: false,
})
