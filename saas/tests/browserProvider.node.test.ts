import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ProviderRegistry,
  createCapabilityRegistry,
  createOriginRegistry,
  createNavigationRegistry,
  createSelectorRegistry,
  createVerificationRegistry,
  createEvidenceRegistry,
  vercelProvider,
  versionKey,
} from '../lib/browser-provider/index.ts'

function cloneProvider(): any {
  return JSON.parse(JSON.stringify(vercelProvider))
}

test('provider registry is deterministic and rejects duplicates/unknowns', () => {
  const registry = new ProviderRegistry()
  registry.register(vercelProvider)
  assert.deepEqual(registry.providers().map(item => item.id), ['vercel'])
  assert.throws(() => registry.register(vercelProvider), /duplicate_provider/)
  assert.throws(() => registry.lookup('missing'), /unknown_provider/)
  assert.equal(JSON.stringify(registry.toJSON()), JSON.stringify(registry.toJSON()))
})

test('registries are deterministic and reject unknown capabilities', () => {
  const capabilities = createCapabilityRegistry(vercelProvider.capabilities)
  assert.equal(capabilities.list()[0].id, 'capture-dashboard-evidence')
  assert.throws(() => capabilities.get('missing'), /unknown_capability/)
  assert.equal(createOriginRegistry(vercelProvider.origins).list()[0].id, 'dashboard')
  assert.equal(createNavigationRegistry(vercelProvider.navigation).list()[0].id, 'dashboard-overview')
  assert.equal(createSelectorRegistry(vercelProvider.selectors).list()[0].id, 'authentication.login')
  assert.equal(createVerificationRegistry(vercelProvider.verification).list()[0].id, 'deployment-failed')
  assert.equal(createEvidenceRegistry(vercelProvider.evidence).list()[0].id, 'dashboard-overview')
})

test('versioning, health, maturity, risk and read-only are deterministic', () => {
  const registry = new ProviderRegistry()
  const provider = registry.register(vercelProvider)
  assert.equal(versionKey(provider.version), '1.0.0|1.0.0|1.0.0')
  assert.equal(provider.health.state, 'unknown')
  assert.deepEqual([...new Set(provider.origins.map(origin => origin.origin))], ['https://vercel.com'])
  for (const capability of provider.capabilities) {
    assert.equal(capability.readOnly, true)
    assert.equal(capability.risk, 'read_only')
    assert.equal(capability.maturity, 'sandbox_verified')
  }
  assert.ok(Object.isFrozen(provider))
  assert.throws(
    () => createCapabilityRegistry([{ ...provider.capabilities[0], readOnly: false } as never]),
    /immutable_read_only/,
  )
})

test('provider capabilities are bound to their declared navigation origins', () => {
  const provider = new ProviderRegistry().register(vercelProvider)
  const navigationById = new Map(provider.navigation.map(profile => [profile.id, profile]))

  for (const capability of provider.capabilities) {
    const navigation = navigationById.get(capability.navigationProfile)
    assert.ok(navigation)
    assert.ok(capability.allowedOrigins.includes(navigation.origin))
    assert.ok(capability.supportsApi || capability.supportsBrowser)
  }

  const projectMetadata = provider.capabilities.find(item => item.id === 'read-project-metadata')
  assert.deepEqual(projectMetadata?.allowedOrigins, ['settings'])

  const dashboardEvidence = provider.capabilities.find(item => item.id === 'capture-dashboard-evidence')
  assert.equal(dashboardEvidence?.navigationProfile, 'dashboard-overview')
  assert.deepEqual(dashboardEvidence?.allowedOrigins, ['dashboard'])
})

test('evidence requirements resolve to registered routes and selectors inside capability scope', () => {
  const provider = new ProviderRegistry().register(vercelProvider)
  const navigationById = new Map<string, (typeof provider.navigation)[number]>(
    provider.navigation.map(profile => [profile.id, profile]),
  )
  const selectorIds = new Set(provider.selectors.map(selector => selector.id))
  const evidenceById = new Map(provider.evidence.map(profile => [profile.id, profile]))

  for (const evidence of provider.evidence) {
    for (const navigationId of evidence.expectedScreenshots) {
      assert.ok(navigationById.has(navigationId))
    }
    for (const selectorId of evidence.expectedReads) {
      assert.ok(selectorIds.has(selectorId))
    }
  }

  for (const capability of provider.capabilities) {
    const evidence = evidenceById.get(capability.evidenceProfile)
    assert.ok(evidence)
    for (const navigationId of evidence.expectedScreenshots) {
      const navigation = navigationById.get(navigationId)
      assert.ok(navigation)
      assert.ok(capability.allowedOrigins.includes(navigation.origin))
    }
  }

  const environmentCapability = provider.capabilities.find(
    item => item.id === 'read-environment-variable-metadata',
  )
  assert.equal(environmentCapability?.evidenceProfile, 'environment-metadata')
  assert.deepEqual(evidenceById.get('environment-metadata')?.expectedScreenshots, [
    'environment-metadata',
  ])
  assert.deepEqual(evidenceById.get('environment-metadata')?.expectedReads, [
    'settings.environment',
  ])
})

test('provider registration creates a detached deeply frozen snapshot', () => {
  const raw = cloneProvider()
  const registry = new ProviderRegistry()
  const registered = registry.register(raw)

  raw.displayName.en = 'Changed'
  raw.origins[0].origin = 'https://example.com'
  raw.capabilities[0].allowedOrigins[0] = 'settings'
  raw.capabilities[0].version.provider = '9.9.9'
  raw.verification[0].assertions[0] = 'status=changed'
  raw.evidence[0].expectedReads[0] = 'changed'

  assert.equal(registered.displayName.en, 'Vercel')
  assert.equal(registered.origins[0].origin, 'https://vercel.com')
  assert.notEqual(registered.capabilities[0].allowedOrigins[0], 'settings')
  assert.equal(registered.capabilities[0].version.provider, '1.0.0')
  assert.notEqual(registered.verification[0].assertions[0], 'status=changed')
  assert.notEqual(registered.evidence[0].expectedReads[0], 'changed')

  assert.ok(Object.isFrozen(registered.displayName))
  assert.ok(Object.isFrozen(registered.origins))
  assert.ok(Object.isFrozen(registered.origins[0]))
  assert.ok(Object.isFrozen(registered.capabilities))
  assert.ok(Object.isFrozen(registered.capabilities[0]))
  assert.ok(Object.isFrozen(registered.capabilities[0].allowedOrigins))
  assert.ok(Object.isFrozen(registered.capabilities[0].version))
  assert.ok(Object.isFrozen(registered.verification[0].assertions))
  assert.ok(Object.isFrozen(registered.evidence[0].expectedReads))
  assert.throws(() => {
    ;(registered.capabilities[0].allowedOrigins as string[])[0] = 'settings'
  }, TypeError)
})

test('provider registration rejects ambiguous metadata and dangling references', () => {
  const duplicateOrigin = cloneProvider()
  duplicateOrigin.origins.push({ ...duplicateOrigin.origins[0] })
  assert.throws(() => new ProviderRegistry().register(duplicateOrigin), /duplicate_origin/)

  const danglingNavigation = cloneProvider()
  danglingNavigation.capabilities[0].navigationProfile = 'missing'
  assert.throws(
    () => new ProviderRegistry().register(danglingNavigation),
    /capability_navigation_reference/,
  )

  const mismatchedNavigationOrigin = cloneProvider()
  mismatchedNavigationOrigin.capabilities[0].allowedOrigins = ['dashboard']
  assert.throws(
    () => new ProviderRegistry().register(mismatchedNavigationOrigin),
    /capability_navigation_origin_mismatch/,
  )

  const danglingEvidenceNavigation = cloneProvider()
  danglingEvidenceNavigation.evidence[0].expectedScreenshots = ['missing']
  assert.throws(
    () => new ProviderRegistry().register(danglingEvidenceNavigation),
    /evidence_screenshot_navigation_reference/,
  )

  const danglingEvidenceSelector = cloneProvider()
  danglingEvidenceSelector.evidence[0].expectedReads = ['missing.selector']
  assert.throws(
    () => new ProviderRegistry().register(danglingEvidenceSelector),
    /evidence_read_selector_reference/,
  )

  const evidenceOriginEscape = cloneProvider()
  const deploymentSuccess = evidenceOriginEscape.evidence.find(
    (profile: any) => profile.id === 'deployment-success',
  )
  deploymentSuccess.expectedScreenshots = ['domains']
  assert.throws(
    () => new ProviderRegistry().register(evidenceOriginEscape),
    /capability_evidence_navigation_origin_mismatch/,
  )

  const missingTransport = cloneProvider()
  missingTransport.capabilities[0].supportsApi = false
  missingTransport.capabilities[0].supportsBrowser = false
  missingTransport.capabilities[0].supportsBrowserOnDemand = false
  assert.throws(
    () => new ProviderRegistry().register(missingTransport),
    /capability_transport_missing/,
  )

  const browserOnDemandWithoutBrowser = cloneProvider()
  browserOnDemandWithoutBrowser.capabilities[0].supportsApi = true
  browserOnDemandWithoutBrowser.capabilities[0].supportsBrowser = false
  browserOnDemandWithoutBrowser.capabilities[0].supportsBrowserOnDemand = true
  assert.throws(
    () => new ProviderRegistry().register(browserOnDemandWithoutBrowser),
    /capability_on_demand_requires_browser/,
  )

  const nonCanonicalOrigin = cloneProvider()
  nonCanonicalOrigin.origins[0].origin = 'https://vercel.com/dashboard'
  assert.throws(() => new ProviderRegistry().register(nonCanonicalOrigin), /origin_url/)

  const protocolRelativeNavigation = cloneProvider()
  protocolRelativeNavigation.navigation[0].pathTemplate = '//evil.example/path'
  assert.throws(
    () => new ProviderRegistry().register(protocolRelativeNavigation),
    /navigation_path/,
  )

  const extraField = cloneProvider()
  extraField.unreviewed = true
  assert.throws(() => new ProviderRegistry().register(extraField), /provider_fields/)
})

test('localization complete and forbidden dependencies absent', async () => {
  for (const locale of ['en', 'es', 'pt', 'pl', 'ru'] as const) {
    assert.ok(vercelProvider.displayName[locale])
  }

  const files = [
    'provider-adapter.ts',
    'provider-registry.ts',
    'provider-routing.ts',
    'provider-capability.ts',
    'provider-origin.ts',
    'provider-navigation.ts',
    'provider-selector.ts',
    'provider-verification.ts',
    'provider-evidence.ts',
    'provider-health.ts',
    'provider-version.ts',
    'provider-errors.ts',
    'providers/vercel-provider.ts',
  ]
  const fs = await import('node:fs/promises')
  for (const file of files) {
    const source = await fs.readFile(new URL(`../lib/browser-provider/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /playwright|browser-runtime|credentials|password|secret/i)
  }
})
