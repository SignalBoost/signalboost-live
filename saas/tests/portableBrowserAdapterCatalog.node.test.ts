// saas/tests/portableBrowserAdapterCatalog.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { allPortableBrowserAdapterDescriptors } from '../lib/portable-browser/catalog/index.ts'
import { checkPortableBrowserCompatibility } from '../lib/portable-browser/browser-compatibility.ts'
import { freezePortableBrowserManifest } from '../lib/portable-browser/browser-portable-manifest.ts'
import {
  PLAYWRIGHT_MCP_PROFILE,
  CHROME_DEVTOOLS_MCP_PROFILE,
  createBrowserMcpRegistryEntries,
} from '../provider-hub-host/browser-mcp-profiles.ts'
import { createMcpOutboundClient } from '../provider-hub-host/mcp-outbound-client.ts'
import { createNodeMcpStdioTransportFactory } from '../provider-hub-host/mcp-stdio-transport.ts'
import {
  assertBrowserMcpNavigationResultForTest,
  assertBrowserMcpRawNavigationResultForTest,
  assertBrowserMcpToolCallForTest,
  liveBrowserMcpToolNames,
} from '../provider-hub-host/browser-mcp-stdio-host.ts'

const availableAdapters = new Set(['browserbase', 'browserless', 'steel', 'playwright'])

test('portable browser descriptors are frozen, serializable, and explicitly inactive', () => {
  const ids = new Set<string>()
  for (const descriptor of allPortableBrowserAdapterDescriptors) {
    assert.ok(Object.isFrozen(descriptor)); assert.ok(!ids.has(descriptor.adapterId)); ids.add(descriptor.adapterId)
    assert.equal(descriptor.vendorDependencyInstalled, false); assert.equal(descriptor.productionEnabled, false)
    assert.equal(descriptor.implementationStatus, availableAdapters.has(descriptor.adapterId) ? 'available' : 'host_adapter_required'); assert.doesNotThrow(() => JSON.stringify(descriptor))
    assert.ok(descriptor.documentationReference); assert.ok(descriptor.supportedPortKinds.length)
  }
  assert.ok(ids.has('playwright-mcp'))
  assert.ok(ids.has('chrome-devtools-mcp'))
})
// Now that every vendor declares its required configuration, the compatibility checker's
// `unresolvedConfigurationFields` rule finally does something: a host that has not supplied a
// vendor's required keys is INCOMPATIBLE. Before the contracts existed, no descriptor
// declared a required field, so that rule matched nothing and every pairing looked
// compatible. These cases pin the real behaviour in both directions.
const hostWithKeys = (configurationKeys: readonly string[]) => ({
  ports: ['session', 'agent_loop'] as const, capabilities: [], environments: [], runtimeLanguages: ['typescript'],
  authenticationModes: [], dataResidencies: [], maximumConcurrentSessions: 10, maximumSessionDurationMs: 60_000,
  productionEnabled: false, configurationKeys, hostRestrictions: [],
}) as any

const requiredKeysFor = (ids: readonly string[]) =>
  allPortableBrowserAdapterDescriptors
    .filter(d => ids.includes(d.adapterId))
    .flatMap(d => d.configurationFieldDefinitions.filter(f => f.required).map(f => f.key))

test('compatibility is capability based and fails closed', () => {
  const manifest=freezePortableBrowserManifest({schemaVersion:'v1',portableId:'example',requiredPorts:['session','agent_loop'],optionalPorts:[],requiredCapabilities:[],optionalCapabilities:[],supportedRuntimeLanguages:['typescript'],requiredEnvironments:[],authenticationMode:'none',evidenceRequirements:[],telemetryRequirements:[],humanControlRequirements:[],approvalRequirements:[],maximumActionCount:1,maximumNavigationCount:1,maximumDurationMs:1,maximumConcurrentSessions:1,productionPermitted:false})
  const pair = allPortableBrowserAdapterDescriptors.filter(x=>['stagehand','browserbase'].includes(x.adapterId))

  // A host that supplies every required configuration key for both vendors is compatible.
  const configured = checkPortableBrowserCompatibility(manifest, pair, hostWithKeys(requiredKeysFor(['stagehand','browserbase'])))
  assert.equal(configured.compatible, true)
  assert.deepEqual(configured.unresolvedConfigurationFields, [])

  // The same pairing with NO configuration supplied is refused, and says which fields are missing.
  const unconfigured = checkPortableBrowserCompatibility(manifest, pair)
  assert.equal(unconfigured.compatible, false)
  assert.ok(unconfigured.unresolvedConfigurationFields.length > 0)
  assert.ok(unconfigured.unresolvedConfigurationFields.every(entry => entry.includes(':')))

  // A missing PORT still fails closed regardless of configuration.
  assert.equal(checkPortableBrowserCompatibility(manifest,allPortableBrowserAdapterDescriptors.filter(x=>x.adapterId==='stagehand'),hostWithKeys(requiredKeysFor(['stagehand']))).compatible,false)
})


test('browser MCP profiles are pinned, stdio, and deny dangerous tools by default', () => {
  assert.equal(PLAYWRIGHT_MCP_PROFILE.transport, 'stdio')
  assert.equal(PLAYWRIGHT_MCP_PROFILE.packageName, '@playwright/mcp')
  assert.equal(PLAYWRIGHT_MCP_PROFILE.packageVersion, '0.0.82')
  assert.equal(CHROME_DEVTOOLS_MCP_PROFILE.transport, 'stdio')
  assert.equal(CHROME_DEVTOOLS_MCP_PROFILE.packageName, 'chrome-devtools-mcp')
  assert.equal(CHROME_DEVTOOLS_MCP_PROFILE.packageVersion, '1.9.0')
  assert.ok(CHROME_DEVTOOLS_MCP_PROFILE.recommendedArgs.includes('--experimental-structured-content=true'))

  const deniedByAbsence = new Set([
    'browser_run_code_unsafe',
    'browser_evaluate',
    'browser_file_upload',
    'upload_file',
    'install_extension',
    'uninstall_extension',
    'install_pwa',
    'execute_3p_developer_tool',
    'execute_webmcp_tool',
  ])

  for (const profile of [PLAYWRIGHT_MCP_PROFILE, CHROME_DEVTOOLS_MCP_PROFILE]) {
    assert.ok(profile.tools.length > 0)
    assert.equal(profile.tools.some(tool => deniedByAbsence.has(tool.remoteToolName)), false)
    for (const tool of profile.tools) {
      if (tool.risk === 'read') assert.equal(tool.requiresApproval, false)
      else assert.equal(tool.requiresApproval, true)
    }
  }

  const entries = createBrowserMcpRegistryEntries({
    tenantId: 'tenant-a',
    environmentId: 'prod',
    portableId: 'software-specialist',
  })
  assert.deepEqual(entries.servers.map(server => server.serverId).sort(), ['chrome-devtools-mcp', 'playwright-mcp'])
  assert.equal(entries.assignments.every(assignment =>
    assignment.tenantId === 'tenant-a' &&
    assignment.environmentId === 'prod' &&
    assignment.portableId === 'software-specialist' &&
    assignment.tools.length > 0
  ), true)
})


test('stateful MCP stdio transport completes initialize notification before tool discovery', async () => {
  const mockServer = String.raw`
    let buffer = ''
    let initialized = false
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => {
      buffer += chunk
      for (;;) {
        const i = buffer.indexOf('\\n')
        if (i < 0) break
        const line = buffer.slice(0, i).trim()
        buffer = buffer.slice(i + 1)
        if (!line) continue
        const req = JSON.parse(line)
        if (req.method === 'notifications/initialized') {
          initialized = true
          continue
        }
        let result
        if (req.method === 'initialize') {
          result = { protocolVersion: req.params.protocolVersion, serverInfo: { name: 'mock-browser-mcp', version: '1.0.0' } }
        } else if (req.method === 'tools/list') {
          if (!initialized) {
            process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'not initialized' } }) + '\\n')
            continue
          }
          result = { tools: [{ name: 'list_pages', description: 'safe', inputSchema: { type: 'object' } }] }
        } else if (req.method === 'tools/call') {
          result = { content: [{ type: 'text', text: 'ok' }], isError: false }
        } else {
          result = {}
        }
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\\n')
      }
    })
  `

  const scope = { tenantId: 'tenant-a', environmentId: 'test', portableId: 'software-specialist' }
  const factory = createNodeMcpStdioTransportFactory({
    commandResolver: {
      resolve() {
        return { command: process.execPath, args: ['-e', mockServer] }
      },
    },
  })
  const transport = factory.create({ serverId: 'mock-browser', transportRef: 'mock:stdio', scope })
  const client = createMcpOutboundClient({ serverId: 'mock-browser', scope, transport })

  const initialized = await client.initialize()
  assert.equal(initialized.serverName, 'mock-browser-mcp')
  assert.equal(initialized.serverVersion, '1.0.0')
  assert.deepEqual((await client.listTools()).map(tool => tool.name), ['list_pages'])
  assert.deepEqual(await client.callTool('list_pages', {}), {
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
  })
  await client.close()
})

test('browser MCP live host rejects hidden tools, filesystem output, and off-origin navigation', () => {
  assert.equal(liveBrowserMcpToolNames('chrome-devtools-mcp').includes('upload_file'), false)
  assert.equal(liveBrowserMcpToolNames('chrome-devtools-mcp').includes('evaluate_script'), false)
  assert.equal(PLAYWRIGHT_MCP_PROFILE.tools.some(tool => tool.remoteToolName === 'browser_evaluate'), false)

  assert.doesNotThrow(() => assertBrowserMcpToolCallForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'navigate_page',
    args: { type: 'url', url: 'https://itmounts.com/dashboard', pageId: 1 },
    approvedOrigins: ['https://itmounts.com'],
  }))

  assert.throws(() => assertBrowserMcpToolCallForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'navigate_page',
    args: { type: 'url', url: 'https://example.com/', pageId: 1 },
    approvedOrigins: ['https://itmounts.com'],
  }), /browser_mcp_navigation_origin_rejected/)

  assert.throws(() => assertBrowserMcpToolCallForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'new_page',
    args: { url: 'https://itmounts.com/', background: true },
    approvedOrigins: ['https://itmounts.com'],
  }), /browser_mcp_background_navigation_rejected/)

  assert.throws(() => assertBrowserMcpToolCallForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'take_screenshot',
    args: { pageId: 1, filePath: '/tmp/leak.png' },
    approvedOrigins: ['https://itmounts.com'],
  }), /browser_mcp_host_write_argument_rejected/)

  assert.throws(() => assertBrowserMcpToolCallForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'upload_file',
    args: { pageId: 1, filePaths: ['/etc/passwd'], uid: '1_2' },
    approvedOrigins: ['https://itmounts.com'],
  }), /browser_mcp_tool_not_live_enabled/)
})


test('Chrome MCP post-navigation evidence rejects an off-origin redirect', () => {
  assert.doesNotThrow(() => assertBrowserMcpNavigationResultForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'new_page',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com', 'https://www.itmounts.com'],
    pages: [
      { id: 0, url: 'about:blank' },
      { id: 1, url: 'https://www.itmounts.com/', selected: true },
    ],
  }))

  assert.throws(() => assertBrowserMcpNavigationResultForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'new_page',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com', 'https://www.itmounts.com'],
    pages: [
      { id: 0, url: 'about:blank' },
      { id: 1, url: 'https://redirect.example/', selected: true },
    ],
  }), /browser_mcp_navigation_origin_rejected/)
})


test('browser MCP post-navigation verification accepts only the final reported approved URL', () => {
  assert.doesNotThrow(() => assertBrowserMcpRawNavigationResultForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'new_page',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com', 'https://www.itmounts.com'],
    rawResult: {
      content: [{
        type: 'text',
        text: '## Pages\n0: about:blank\n1: attacker-title https://redirect.example/ (https://www.itmounts.com/) [selected]',
      }],
    },
  }))

  assert.throws(() => assertBrowserMcpRawNavigationResultForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'new_page',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com', 'https://www.itmounts.com'],
    rawResult: {
      content: [{ type: 'text', text: '## Pages\n1: iTMounts (https://redirect.example/) [selected]' }],
    },
  }), /browser_mcp_navigation_origin_rejected/)

  assert.doesNotThrow(() => assertBrowserMcpRawNavigationResultForTest({
    serverId: 'playwright-mcp',
    toolName: 'browser_navigate',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com', 'https://www.itmounts.com'],
    rawResult: {
      content: [{
        type: 'text',
        text: '### Page state\n- Page URL: https://www.itmounts.com/\n- Page Title: iTMounts',
      }],
    },
  }))

  assert.throws(() => assertBrowserMcpRawNavigationResultForTest({
    serverId: 'playwright-mcp',
    toolName: 'browser_navigate',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com', 'https://www.itmounts.com'],
    rawResult: {
      content: [{
        type: 'text',
        text: '### Page state\n- Page URL: https://redirect.example/\n- Page Title: Redirect',
      }],
    },
  }), /browser_mcp_navigation_origin_rejected/)

  assert.throws(() => assertBrowserMcpRawNavigationResultForTest({
    serverId: 'playwright-mcp',
    toolName: 'browser_navigate',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com'],
    rawResult: { content: [{ type: 'text', text: 'navigation completed without page evidence' }] },
  }), /browser_mcp_navigation_evidence_missing/)
})


test('browser MCP navigation guard preserves upstream tool failures for adapter error handling', () => {
  assert.doesNotThrow(() => assertBrowserMcpRawNavigationResultForTest({
    serverId: 'chrome-devtools-mcp',
    toolName: 'new_page',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com', 'https://www.itmounts.com'],
    rawResult: {
      isError: true,
      content: [{ type: 'text', text: 'Unable to navigate to the requested page.' }],
    },
  }))

  assert.doesNotThrow(() => assertBrowserMcpRawNavigationResultForTest({
    serverId: 'playwright-mcp',
    toolName: 'browser_navigate',
    args: { url: 'https://itmounts.com/' },
    approvedOrigins: ['https://itmounts.com', 'https://www.itmounts.com'],
    rawResult: {
      isError: true,
      content: [{ type: 'text', text: 'Navigation failed.' }],
    },
  }))
})
