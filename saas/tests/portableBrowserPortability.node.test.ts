import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { allPortableBrowserAdapterDescriptors } from '../lib/portable-browser/catalog/index.ts'
import { checkPortableBrowserCompatibility } from '../lib/portable-browser/browser-compatibility.ts'
import { freezePortableBrowserManifest } from '../lib/portable-browser/browser-portable-manifest.ts'
import {
  browserAgentCommercialPortabilityContract,
  validateCommercialPortabilityContract,
} from '../lib/portable-browser/commercial-portability.ts'

const availableAdapters = new Set(['browserbase', 'browserless', 'steel'])
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const portableBrowserDirectory = path.resolve(currentDirectory, '../lib/portable-browser')
const forbiddenLabMarkers = Object.freeze([
  'signalboostapp.com',
  'saas.signalboostapp.com',
  'signalboost-clean',
  'supabase.auth',
  'vercel.com/api',
])

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(absolutePath)
    return /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [absolutePath] : []
  }))
  return files.flat()
}

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

test('commercial portability contract is immutable, complete, and buyer-owned', () => {
  const contract = browserAgentCommercialPortabilityContract
  assert.equal(validateCommercialPortabilityContract(contract), true)
  assert.equal(contract.companyNeutral, true)
  assert.equal(contract.productScope, 'standalone_commercial_product')
  assert.equal(contract.labIntegrationMode, 'optional_reference_adapter_only')
  assert.ok(Object.isFrozen(contract))
  assert.ok(Object.isFrozen(contract.buyerOwnedConfiguration))
  assert.ok(Object.isFrozen(contract.supportedDeploymentModels))
  assert.ok(Object.isFrozen(contract.requiredDistributionArtifacts))
  assert.ok(Object.isFrozen(contract.forbiddenCoreDependencies))

  for (const required of ['credentials', 'policies', 'branding', 'storage', 'deployment']) {
    assert.ok(contract.buyerOwnedConfiguration.includes(required), `missing buyer-owned field: ${required}`)
  }
  for (const artifact of ['versioned_package', 'configuration_schema', 'installation_guide', 'health_check']) {
    assert.ok(contract.requiredDistributionArtifacts.includes(artifact), `missing distribution artifact: ${artifact}`)
  }
})

test('portable Browser Agent core contains no known lab-specific service bindings', async () => {
  const files = await listSourceFiles(portableBrowserDirectory)
  assert.ok(files.length > 0)
  for (const file of files) {
    const source = (await readFile(file, 'utf8')).toLowerCase()
    for (const marker of forbiddenLabMarkers) {
      assert.equal(source.includes(marker), false, `${path.relative(portableBrowserDirectory, file)} contains ${marker}`)
    }
  }
})
