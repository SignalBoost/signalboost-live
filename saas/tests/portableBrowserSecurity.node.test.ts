// saas/tests/portableBrowserSecurity.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { allPortableBrowserAdapterDescriptors } from '../lib/portable-browser/catalog/index.ts'
import { checkPortableBrowserCompatibility } from '../lib/portable-browser/browser-compatibility.ts'
import { freezePortableBrowserManifest } from '../lib/portable-browser/browser-portable-manifest.ts'

const availableAdapters = new Set(['browserbase', 'browserless', 'steel', 'playwright'])

test('portable browser descriptors are frozen, serializable, and explicitly inactive', () => {
  const ids = new Set<string>()
  for (const descriptor of allPortableBrowserAdapterDescriptors) {
    assert.ok(Object.isFrozen(descriptor)); assert.ok(!ids.has(descriptor.adapterId)); ids.add(descriptor.adapterId)
    assert.equal(descriptor.vendorDependencyInstalled, false); assert.equal(descriptor.productionEnabled, false)
    assert.equal(descriptor.implementationStatus, availableAdapters.has(descriptor.adapterId) ? 'available' : 'host_adapter_required'); assert.doesNotThrow(() => JSON.stringify(descriptor))
    assert.ok(descriptor.documentationReference); assert.ok(descriptor.supportedPortKinds.length)
  }
})
// Now that every vendor declares its required configuration, the compatibility checker's
// `unresolvedConfigurationFields` rule finally does something: a host that has not supplied a
// vendor's required keys is INCOMPATIBLE. Before the contracts existed, no descriptor declared
// a required field, so that rule matched nothing and every pairing looked compatible.
const hostWithKeys = (configurationKeys: readonly string[]) => ({
  ports: ['session', 'agent_loop'], capabilities: [], environments: [], runtimeLanguages: ['typescript'],
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

  const configured = checkPortableBrowserCompatibility(manifest, pair, hostWithKeys(requiredKeysFor(['stagehand','browserbase'])))
  assert.equal(configured.compatible, true)
  assert.deepEqual(configured.unresolvedConfigurationFields, [])

  const unconfigured = checkPortableBrowserCompatibility(manifest, pair)
  assert.equal(unconfigured.compatible, false)
  assert.ok(unconfigured.unresolvedConfigurationFields.length > 0)

  assert.equal(checkPortableBrowserCompatibility(manifest,allPortableBrowserAdapterDescriptors.filter(x=>x.adapterId==='stagehand'),hostWithKeys(requiredKeysFor(['stagehand']))).compatible,false)
})
