// saas/lib/portable-browser/catalog/chrome-devtools-mcp.ts
import { freezePortableBrowserAdapterDescriptor } from '../browser-adapter-descriptor.ts'

export const chrome_devtools_mcpDescriptor = freezePortableBrowserAdapterDescriptor({
  adapterId: 'chrome-devtools-mcp',
  displayName: 'Chrome DevTools MCP',
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
    'performance_trace',
    'screenshot',
    'bounded_interaction',
  ],
  authenticationModes: ['buyer_managed'],
  observabilityCapabilities: ['audit_events', 'console_messages', 'network_requests', 'performance_traces'],
  humanControlCapabilities: [],
  evidenceCapabilities: ['screenshots', 'accessibility_snapshots', 'performance_traces'],
  complianceMetadataKeys: ['tenant_isolation', 'approved_origins', 'mcp_transport'],
  configurationFieldDefinitions: [
    {
      key: 'transportRef',
      type: 'string',
      required: true,
      description: 'Host-owned logical transport reference for the stdio Chrome DevTools MCP process.',
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
