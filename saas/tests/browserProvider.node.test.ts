import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BrowserProviderRegistry,
  ProviderRegistry,
  VercelBrowserAdapter,
  vercelProvider,
  createDefaultBrowserProviderRegistry,
  createCapabilityRegistry,
  createOriginRegistry,
  createNavigationRegistry,
  createSelectorRegistry,
  createVerificationRegistry,
  createEvidenceRegistry,
  versionKey,
  mapBrowserProviderCapabilityToSupervisorCapability,
  createBrowserProviderWorkerDescriptor,
  createBrowserProviderPolicyReviewSnapshot,
} from '../lib/browser-provider/index.ts'

test('canonical public entry point exports expected symbols and compatibility aliases', () => {
  assert.equal(typeof BrowserProviderRegistry, 'function')
  assert.equal(ProviderRegistry, BrowserProviderRegistry)
  assert.equal(vercelProvider, VercelBrowserAdapter)
  assert.equal(createDefaultBrowserProviderRegistry().list()[0].providerId, 'vercel')
})

test('provider registry is deterministic and rejects duplicates and unknown providers', () => {
  const registry = new BrowserProviderRegistry()
  registry.register(VercelBrowserAdapter)
  assert.deepEqual(registry.list().map(provider => provider.providerId), ['vercel'])
  assert.throws(() => registry.register(VercelBrowserAdapter), /duplicate_provider/)
  assert.throws(() => registry.get('missing'), /unknown_provider/)
  assert.equal(JSON.stringify(registry.toJSON()), JSON.stringify(registry.toJSON()))
})

test('canonical registries are deterministic, defensive, and reject duplicate or invalid metadata', () => {
  const provider = VercelBrowserAdapter
  const capabilities = createCapabilityRegistry(provider.capabilities)
  assert.equal(capabilities.list()[0].capabilityId, 'capture_dashboard_evidence')
  assert.throws(() => capabilities.get('missing'), /unknown_capability/)
  assert.throws(() => createCapabilityRegistry([provider.capabilities[0], provider.capabilities[0]]), /duplicate_capability/)
  assert.throws(() => createCapabilityRegistry([{ ...provider.capabilities[0], readOnly: false }]), /immutable_read_only/)
  const copy = capabilities.list()[0]
  assert.throws(() => ((copy.allowedOriginIds as string[])[0] = 'mutated'), /Cannot assign|read only|not extensible/)

  assert.equal(createOriginRegistry(provider.origins).list()[0].originId, 'vercel_dashboard')
  assert.throws(() => createOriginRegistry([provider.origins[0], provider.origins[0]]), /duplicate_origin/)
  assert.throws(() => createOriginRegistry([{ ...provider.origins[0], exactOrigin: 'http://vercel.com' }]), /invalid_origin/)

  assert.equal(createNavigationRegistry(provider.navigationProfiles).list()[0].navigationProfileId, 'vercel_deployment_details')
  assert.throws(() => createNavigationRegistry([provider.navigationProfiles[0], provider.navigationProfiles[0]]), /duplicate_navigation/)

  assert.equal(createSelectorRegistry(provider.selectors).list()[0].selectorId, 'vercel_authentication_login_form')
  assert.throws(() => createSelectorRegistry([provider.selectors[0], provider.selectors[0]]), /duplicate_selector/)
  assert.throws(() => createSelectorRegistry([{ ...provider.selectors[0], selector: { strategy: 'css', css: '*' } }]), /invalid_selector/)

  assert.equal(createEvidenceRegistry(provider.evidenceProfiles).list()[0].evidenceProfileId, 'dashboard_api_comparison')
  assert.throws(() => createEvidenceRegistry([provider.evidenceProfiles[0], provider.evidenceProfiles[0]]), /duplicate_evidence/)

  assert.equal(createVerificationRegistry(provider.verificationProfiles).list()[0].verificationProfileId, 'dashboard_differs_from_api')
  assert.throws(() => createVerificationRegistry([provider.verificationProfiles[0], provider.verificationProfiles[0]]), /duplicate_verification/)
})

test('Vercel adapter is read-only, non-production, and exposes no mutation capability', () => {
  assert.equal(VercelBrowserAdapter.supportsProduction(), false)
  assert.equal(VercelBrowserAdapter.supportsReadOnlyInspection(), true)
  assert.equal(VercelBrowserAdapter.supportsAutoFailover(), false)
  assert.equal(versionKey(VercelBrowserAdapter.getVersion()), 'vercel-browser-adapter-v1|vercel-browser-capabilities-v1|1.0.0')
  for (const capability of VercelBrowserAdapter.capabilities) {
    assert.equal(capability.readOnly, true)
    assert.equal(capability.riskClass, 'read_only')
    assert.equal(capability.supportsAutoFailover, false)
    assert.doesNotMatch(capability.operation, /create|update|delete|mutate|write|redeploy|rollback|set_/i)
  }
})

test('suspended provider and suspended capability fail closed', () => {
  const registry = new BrowserProviderRegistry()
  registry.register({ ...VercelBrowserAdapter, health: { state: 'suspended', checkedAt: '1970-01-01T00:00:00.000Z' } })
  assert.throws(() => registry.get('vercel'), /provider_suspended/)
  assert.throws(() => createCapabilityRegistry([{ ...VercelBrowserAdapter.capabilities[0], maturity: 'suspended' }]).get(VercelBrowserAdapter.capabilities[0].capabilityId), /capability_suspended/)
})

test('Supervisor mapping and worker descriptor preserve policy boundaries', () => {
  const capability = VercelBrowserAdapter.capabilities[0]
  const mapped = mapBrowserProviderCapabilityToSupervisorCapability(capability)
  assert.equal(mapped.riskClass, capability.riskClass)
  assert.equal(mapped.maturity, capability.maturity)
  assert.equal(mapped.channels.browser, capability.supportsBrowser)
  assert.equal(mapped.supportsAutoFailover, false)
  assert.deepEqual(mapped.allowedEnvironments, ['sandbox', 'preview'])
  assert.equal(mapped.verificationProfileId, capability.verificationProfileId)
  const worker = createBrowserProviderWorkerDescriptor(VercelBrowserAdapter)
  assert.equal(worker.maximumConcurrentWork, 0)
  assert.deepEqual(worker.executionDependencies, [])
})

test('policy review snapshot is detached, immutable, non-executable, and production-disabled', () => {
  const snapshot = createBrowserProviderPolicyReviewSnapshot(VercelBrowserAdapter)
  assert.equal(snapshot.providerId, 'vercel')
  assert.equal(snapshot.productionExecutionEnabled, false)
  assert.equal(snapshot.maximumConcurrentWork, 0)
  assert.deepEqual(snapshot.executionDependencies, [])
  assert.equal(snapshot.capabilityCount, VercelBrowserAdapter.capabilities.length)
  assert.deepEqual(snapshot.capabilities.map(capability => capability.capabilityId), [...snapshot.capabilities.map(capability => capability.capabilityId)].sort())
  for (const capability of snapshot.capabilities) {
    assert.equal(capability.readOnly, true)
    assert.deepEqual(capability.allowedEnvironments, ['sandbox', 'preview'])
    assert.equal(capability.allowedEnvironments.includes('production' as never), false)
  }
  assert.doesNotMatch(JSON.stringify(snapshot), /selector|routeTemplate|exactOrigin|credential|secret|token/i)
  assert.throws(() => ((snapshot.capabilities as unknown as object[]).push({})), /not extensible|read only|Cannot add/)
  assert.throws(() => ((snapshot.capabilities[0].approvedOriginIds as string[])[0] = 'changed'), /Cannot assign|read only|not extensible/)
  assert.throws(() => createBrowserProviderPolicyReviewSnapshot({ ...VercelBrowserAdapter, supportsProduction: () => true }), /invalid_provider/)
})

test('Supervisor HA page renders BPAL policy metadata without execution controls or live provider access', async () => {
  const page = await readFile(new URL('../app/dashboard/supervisor/ha/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /createBrowserProviderPolicyReviewSnapshot/)
  assert.match(page, /productionBrowserExecutionDisabled/)
  assert.doesNotMatch(page, /<button|onClick\s*=|fetch\(|resumeBrowserTask|runBrowserTask|credential|secret/i)
})

test('BPAL source has one canonical implementation and forbidden imports are absent', async () => {
  const root = new URL('../lib/browser-provider/', import.meta.url)
  async function walk(url) {
    const entries = await readdir(url, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url)
      if (entry.isDirectory()) files.push(...await walk(child))
      else if (/\.ts$/.test(entry.name)) files.push(child)
    }
    return files
  }
  const files = await walk(root)
  const texts = await Promise.all(files.map(async file => [file.pathname, await readFile(file, 'utf8')]))
  assert.equal(texts.filter(([, text]) => /class\s+BrowserProviderRegistry\b/.test(text)).length, 1)
  assert.equal(texts.filter(([, text]) => /interface\s+BrowserProviderAdapter\b/.test(text)).length, 1)
  assert.equal(texts.filter(([, text]) => /\bVercelBrowserAdapter\b\s*[:=]/.test(text)).length, 1)
  for (const [, text] of texts) assert.doesNotMatch(text, /playwright|browser-runtime|credential resolver|provider mutation|fetch\(|XMLHttpRequest/i)
  const runtimeFiles = await readdir(new URL('../lib/browser-runtime/', import.meta.url))
  for (const file of runtimeFiles.filter(name => name.endsWith('.ts'))) assert.doesNotMatch(await readFile(join(new URL('../lib/browser-runtime/', import.meta.url).pathname, file), 'utf8'), /vercel/i)
})

test('browser provider localization keys exist for all five languages', async () => {
  const locales = ['en','es','pt','pl','ru']
  const keys = [VercelBrowserAdapter.displayNameKey, ...VercelBrowserAdapter.capabilities.flatMap(c => [c.displayNameKey, c.descriptionKey]), ...VercelBrowserAdapter.origins.map(o => o.labelKey), ...VercelBrowserAdapter.navigationProfiles.map(n => n.labelKey)].filter(Boolean)
  for (const locale of locales) {
    const dict = JSON.parse(await readFile(new URL(`../locales/${locale}.json`, import.meta.url), 'utf8'))
    for (const key of keys) assert.ok(key.split('.').reduce((value, part) => value?.[part], dict), `${locale}:${key}`)
  }
})
