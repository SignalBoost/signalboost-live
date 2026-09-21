// saas/provider-hub-host/browser-mcp-profiles.ts
//
// First-class governed profiles for browser MCP servers consumed through Provider Hub.
//
// These profiles are authorization input, not trust in remote self-description. Only tools listed
// here may be mapped into a portable/agent assignment. Read-only diagnostics stay read-only.
// Browser interaction is mapped as write and requires the existing Portable Connector Runtime
// approval gate. JavaScript evaluation is not exposed by the default governed profiles. High-risk
// surfaces such as arbitrary Playwright code,
// file upload, Chrome extension mutation, PWA installation, third-party developer tools, and
// nested WebMCP execution are deliberately absent from the default profiles.
//
// Both upstream servers are stdio-first. The host owns process lifecycle, browser installation,
// authentication, and transport wiring behind transportRef. No package is dynamically installed by
// this portable profile and no endpoint/credential is persisted here.

import type { PortableCapabilityRisk } from '../provider-hub-core/capability-runtime.ts'
import type {
  McpPortableServerAssignment,
  McpRegisteredServer,
  McpRegisteredToolMapping,
} from './mcp-connection-registry.ts'

export const BROWSER_MCP_PROFILE_VERSION = 'browser-mcp-profile-v1' as const

export type BrowserMcpProfileId = 'playwright-mcp' | 'chrome-devtools-mcp'

export interface BrowserMcpToolPolicy {
  readonly remoteToolName: string
  readonly capabilityName: string
  readonly risk: PortableCapabilityRisk
  readonly requiresApproval: boolean
  readonly scopes: readonly string[]
}

export interface BrowserMcpServerProfile {
  readonly profileId: BrowserMcpProfileId
  readonly serverId: BrowserMcpProfileId
  readonly displayName: string
  readonly transport: 'stdio'
  readonly packageName: string
  readonly packageVersion: string
  readonly transportRef: string
  readonly recommendedArgs: readonly string[]
  readonly tools: readonly BrowserMcpToolPolicy[]
}

const readTool = (remoteToolName: string, capabilityName: string): BrowserMcpToolPolicy => Object.freeze({
  remoteToolName,
  capabilityName,
  risk: 'read' as const,
  requiresApproval: false,
  scopes: Object.freeze(['browser.observe']),
})

const writeTool = (remoteToolName: string, capabilityName: string): BrowserMcpToolPolicy => Object.freeze({
  remoteToolName,
  capabilityName,
  risk: 'write' as const,
  requiresApproval: true,
  scopes: Object.freeze(['browser.interact']),
})

export const PLAYWRIGHT_MCP_PROFILE: BrowserMcpServerProfile = Object.freeze({
  profileId: 'playwright-mcp',
  serverId: 'playwright-mcp',
  displayName: 'Playwright MCP',
  transport: 'stdio',
  packageName: '@playwright/mcp',
  packageVersion: '0.0.82',
  transportRef: 'host:mcp:playwright',
  recommendedArgs: Object.freeze(['--headless', '--isolated', '--browser', 'chrome']),
  tools: Object.freeze([
    readTool('browser_snapshot', 'snapshot'),
    readTool('browser_find', 'find'),
    readTool('browser_take_screenshot', 'screenshot'),
    readTool('browser_console_messages', 'console'),
    readTool('browser_network_requests', 'network.list'),
    readTool('browser_network_request', 'network.get'),
    writeTool('browser_navigate', 'navigate'),
    writeTool('browser_navigate_back', 'navigate.back'),
    writeTool('browser_click', 'click'),
    writeTool('browser_hover', 'hover'),
    writeTool('browser_type', 'type'),
    writeTool('browser_fill_form', 'fill_form'),
    writeTool('browser_select_option', 'select_option'),
    writeTool('browser_press_key', 'press_key'),
    writeTool('browser_handle_dialog', 'handle_dialog'),
  ]),
})

export const CHROME_DEVTOOLS_MCP_PROFILE: BrowserMcpServerProfile = Object.freeze({
  profileId: 'chrome-devtools-mcp',
  serverId: 'chrome-devtools-mcp',
  displayName: 'Chrome DevTools MCP',
  transport: 'stdio',
  packageName: 'chrome-devtools-mcp',
  packageVersion: '1.9.0',
  transportRef: 'host:mcp:chrome-devtools',
  recommendedArgs: Object.freeze([
    '--headless=true',
    '--isolated=true',
    '--no-usage-statistics',
    '--performance-crux=false',
    '--javascript-evaluation=false',
    '--redact-network-headers=true',
    '--screenshot-format=jpeg',
    '--screenshot-quality=70',
    '--screenshot-max-width=1440',
    '--screenshot-max-height=1200',
  ]),
  tools: Object.freeze([
    readTool('list_pages', 'pages.list'),
    readTool('take_snapshot', 'snapshot'),
    readTool('take_screenshot', 'screenshot'),
    readTool('list_console_messages', 'console.list'),
    readTool('get_console_message', 'console.get'),
    readTool('list_network_requests', 'network.list'),
    readTool('get_network_request', 'network.get'),
    readTool('get_css_styles', 'css.inspect'),
    readTool('lighthouse_audit', 'lighthouse'),
    readTool('performance_start_trace', 'performance.start'),
    readTool('performance_stop_trace', 'performance.stop'),
    readTool('performance_analyze_insight', 'performance.analyze'),
    writeTool('navigate_page', 'navigate'),
    writeTool('new_page', 'page.new'),
    writeTool('select_page', 'page.select'),
    writeTool('click', 'click'),
    writeTool('click_at', 'click_at'),
    writeTool('drag', 'drag'),
    writeTool('fill', 'fill'),
    writeTool('fill_form', 'fill_form'),
    writeTool('hover', 'hover'),
    writeTool('press_key', 'press_key'),
    writeTool('type_text', 'type'),
    writeTool('handle_dialog', 'handle_dialog'),
  ]),
})

export const BROWSER_MCP_PROFILES: readonly BrowserMcpServerProfile[] = Object.freeze([
  PLAYWRIGHT_MCP_PROFILE,
  CHROME_DEVTOOLS_MCP_PROFILE,
])

function mappingsFor(
  profile: BrowserMcpServerProfile,
  connectionId: string,
): readonly McpRegisteredToolMapping[] {
  return Object.freeze(profile.tools.map(tool => Object.freeze({
    remoteToolName: tool.remoteToolName,
    capabilityId: `browser.${profile.profileId}.${tool.capabilityName}`,
    providerId: profile.serverId,
    connectionId,
    risk: tool.risk,
    requiresApproval: tool.requiresApproval,
    scopes: tool.scopes,
    metadata: Object.freeze({
      browserMcpProfileVersion: BROWSER_MCP_PROFILE_VERSION,
      browserMcpProfile: profile.profileId,
      originPolicy: 'host_enforced',
    }),
  })))
}

export function createBrowserMcpRegistryEntries(input: {
  tenantId: string
  environmentId: string
  portableId: string
  enabledProfiles?: readonly BrowserMcpProfileId[]
}): {
  readonly servers: readonly McpRegisteredServer[]
  readonly assignments: readonly McpPortableServerAssignment[]
} {
  const enabled = new Set(input.enabledProfiles ?? BROWSER_MCP_PROFILES.map(profile => profile.profileId))
  const selected = BROWSER_MCP_PROFILES.filter(profile => enabled.has(profile.profileId))

  return Object.freeze({
    servers: Object.freeze(selected.map(profile => Object.freeze({
      serverId: profile.serverId,
      displayName: profile.displayName,
      transportRef: profile.transportRef,
      enabled: true,
      metadata: Object.freeze({
        profileVersion: BROWSER_MCP_PROFILE_VERSION,
        transport: profile.transport,
        packageName: profile.packageName,
        packageVersion: profile.packageVersion,
      }),
    }))),
    assignments: Object.freeze(selected.map(profile => Object.freeze({
      assignmentId: `${profile.serverId}:${input.tenantId}:${input.environmentId}:${input.portableId}`,
      serverId: profile.serverId,
      tenantId: input.tenantId,
      environmentId: input.environmentId,
      portableId: input.portableId,
      enabled: true,
      tools: mappingsFor(profile, `${profile.serverId}:${input.environmentId}`),
    }))),
  })
}
