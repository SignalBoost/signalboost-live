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
  assert.equal(PLAYWRIGHT_MCP_PROFILE.packageVersion, '0.0.81')
  assert.equal(CHROME_DEVTOOLS_MCP_PROFILE.transport, 'stdio')
  assert.equal(CHROME_DEVTOOLS_MCP_PROFILE.packageName, 'chrome-devtools-mcp')
  assert.equal(CHROME_DEVTOOLS_MCP_PROFILE.packageVersion, '1.9.0')

  const deniedByAbsence = new Set([
    'browser_run_code_unsafe',
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
