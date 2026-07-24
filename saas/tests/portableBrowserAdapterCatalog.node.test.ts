import test from 'node:test'
import assert from 'node:assert/strict'
import { allPortableBrowserAdapterDescriptors } from '../lib/portable-browser/catalog/index.ts'
import { checkPortableBrowserCompatibility } from '../lib/portable-browser/browser-compatibility.ts'
import { freezePortableBrowserManifest } from '../lib/portable-browser/browser-portable-manifest.ts'

const availableAdapters = new Set(['browserbase', 'browserless', 'steel'])

test('portable browser descriptors are frozen, serializable, and explicitly inactive', () => {
  const ids = new Set<string>()
  for (const descriptor of allPortableBrowserAdapterDescriptors) {
    assert.ok(Object.isFrozen(descriptor)); assert.ok(!ids.has(descriptor.adapterId)); ids.add(descriptor.adapterId)
    assert.equal(descriptor.vendorDependencyInstalled, false); assert.equal(descriptor.productionEnabled, false)
    assert.equal(descriptor.implementationStatus, availableAdapters.has(descriptor.adapterId) ? 'available' : 'host_adapter_required'); assert.doesNotThrow(() => JSON.stringify(descriptor))
    assert.ok(descriptor.documentationReference); assert.ok(descriptor.supportedPortKinds.length)
  }
})
test('compatibility is capability based and fails closed', () => {
  const manifest=freezePortableBrowserManifest({schemaVersion:'v1',portableId:'example',requiredPorts:['session','agent_loop'],optionalPorts:[],requiredCapabilities:[],optionalCapabilities:[],supportedRuntimeLanguages:['typescript'],requiredEnvironments:[],authenticationMode:'none',evidenceRequirements:[],telemetryRequirements:[],humanControlRequirements:[],approvalRequirements:[],maximumActionCount:1,maximumNavigationCount:1,maximumDurationMs:1,maximumConcurrentSessions:1,productionPermitted:false})
  assert.equal(checkPortableBrowserCompatibility(manifest,allPortableBrowserAdapterDescriptors.filter(x=>['stagehand','browserbase'].includes(x.adapterId))).compatible,true)
  assert.equal(checkPortableBrowserCompatibility(manifest,allPortableBrowserAdapterDescriptors.filter(x=>x.adapterId==='stagehand')).compatible,false)
})
