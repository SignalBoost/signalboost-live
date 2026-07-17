import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import {
  UniversalProviderRegistry,
  UniversalProviderError,
  UNIVERSAL_PROVIDER_SCHEMA_VERSION,
  createUniversalSdkFromBrowserProvider,
} from '../lib/provider-framework/index.ts'
import { VercelBrowserAdapter } from '../lib/browser-provider/index.ts'

function provider(overrides = {}) {
  return {
    providerId: 'example',
    displayNameKey: 'universalProvider.example.displayName',
    descriptionKey: 'universalProvider.example.description',
    version: { providerVersion: '1.0.0', sdkVersion: 'sdk-1', capabilityCatalogVersion: 'cap-1', schemaVersion: UNIVERSAL_PROVIDER_SCHEMA_VERSION, compatibleSchemaVersions: [UNIVERSAL_PROVIDER_SCHEMA_VERSION] },
    health: { lifecycle: 'registered', checkedAt: '1970-01-01T00:00:00.000Z' },
    capabilities: [{
      capabilityId: 'read_status', displayNameKey: 'universalProvider.example.capabilities.readStatus.title', descriptionKey: 'universalProvider.example.capabilities.readStatus.description', version: '1.0.0', maturity: 'sandbox_verified', riskClass: 'read_only', channels: ['api','scheduler'], environments: ['sandbox','preview'], authentication: ['api_key'], requiresApproval: false, readOnly: true,
      rateLimit: { windowSeconds: 60, maxRequests: 120, scope: 'tenant' }, timeout: { connectMs: 1000, readMs: 2000, totalMs: 5000 }, retryPolicy: { maxAttempts: 2, backoff: 'exponential', baseDelayMs: 100, maxDelayMs: 1000 },
      webhook: { supported: true, eventTypes: ['status.changed'], signatureSchemes: ['hmac-sha256'], replayProtection: true, localizationKey: 'universalProvider.example.webhook' }, scheduler: { supported: true, minimumIntervalSeconds: 300, jitterSupported: true, localizationKey: 'universalProvider.example.scheduler' }, evidenceProviderIds: ['status_snapshot'], verificationProviderIds: ['status_consistency'],
    }],
    supportedChannels: ['api','manual','scheduler','webhook'], supportedAuthentication: ['api_key','oauth2'], supportedEnvironments: ['local','sandbox','preview','production'], supportedRegions: ['us','eu'],
    configurationSchema: { schemaId: 'example.config', version: '1.0.0', fields: [{ key: 'endpoint', type: 'url', required: true, labelKey: 'universalProvider.example.config.endpoint', validationPattern: '^https://'}] },
    webhook: { supported: true, eventTypes: ['status.changed'], signatureSchemes: ['hmac-sha256'], replayProtection: true, localizationKey: 'universalProvider.example.webhook' },
    scheduler: { supported: true, minimumIntervalSeconds: 300, jitterSupported: true, localizationKey: 'universalProvider.example.scheduler' },
    operator: { ownerTeamKey: 'universalProvider.operator.ownerTeam', documentationKey: 'universalProvider.operator.documentation' },
    ...overrides,
  }
}
function sdk(metadata = provider()) { return { metadata, listCapabilities: () => metadata.capabilities, getCapability: id => metadata.capabilities.find(c => c.capabilityId === id), getHealth: () => metadata.health, getVersion: () => metadata.version } }

test('registers providers, freezes metadata, rejects duplicates, and discovers capabilities', () => {
  const registry = new UniversalProviderRegistry()
  const registered = registry.register(sdk())
  assert.equal(registered.metadata.providerId, 'example')
  assert.equal(registry.discoverCapabilities('example')[0].capabilityId, 'read_status')
  assert.equal(registry.findCapability('example', 'read_status').rateLimit.maxRequests, 120)
  assert.throws(() => registry.register(sdk()), /duplicate_provider/)
  assert.throws(() => registry.get('missing'), /unknown_provider/)
  assert.ok(Object.isFrozen(registered.metadata.capabilities[0].channels))
})

test('validates lifecycle, version compatibility, configuration, rate limits, webhooks, and schedulers', () => {
  assert.throws(() => new UniversalProviderRegistry().register(sdk(provider({ health: { lifecycle: 'bad', checkedAt: '1970-01-01T00:00:00.000Z' } }))), /invalid_provider_metadata/)
  assert.throws(() => new UniversalProviderRegistry().register(sdk(provider({ version: { providerVersion: '1', sdkVersion: '1', capabilityCatalogVersion: '1', schemaVersion: UNIVERSAL_PROVIDER_SCHEMA_VERSION, compatibleSchemaVersions: [] } }))), /invalid_provider_metadata/)
  assert.throws(() => new UniversalProviderRegistry().register(sdk(provider({ configurationSchema: { schemaId: 'x', version: '1', fields: [{ key: 'mode', type: 'enum', required: true, labelKey: 'universalProvider.example.config.mode', options: [] }] } }))), /invalid_configuration_schema/)
  const badRate = provider(); badRate.capabilities = [{ ...badRate.capabilities[0], rateLimit: { windowSeconds: 0, maxRequests: 1, scope: 'tenant' } }]
  assert.throws(() => new UniversalProviderRegistry().register(sdk(badRate)), /invalid_rate_limit/)
  const badWebhook = provider({ webhook: { supported: false, eventTypes: [], signatureSchemes: [], replayProtection: false } })
  assert.throws(() => new UniversalProviderRegistry().register(sdk(badWebhook)), /invalid_webhook_metadata/)
  const badScheduler = provider({ scheduler: { supported: false, jitterSupported: false } })
  assert.throws(() => new UniversalProviderRegistry().register(sdk(badScheduler)), /invalid_scheduler_metadata/)
})

test('deterministically blocks unavailable providers and suspended capabilities', () => {
  for (const lifecycle of ['disabled','retired','suspended','failed_validation']) {
    const registry = new UniversalProviderRegistry(); registry.register(sdk(provider({ health: { lifecycle, checkedAt: '1970-01-01T00:00:00.000Z' } })))
    assert.throws(() => registry.get('example'), /provider_unavailable/)
  }
  const metadata = provider(); metadata.capabilities = [{ ...metadata.capabilities[0], maturity: 'suspended' }]
  const registry = new UniversalProviderRegistry(); registry.register(sdk(metadata))
  assert.throws(() => registry.findCapability('example', 'read_status'), /capability_suspended/)
})

test('bridges canonical BPAL metadata without Browser Runtime, Supervisor, dispatcher, or provider SDK coupling', async () => {
  const registry = new UniversalProviderRegistry()
  const registered = registry.register(createUniversalSdkFromBrowserProvider(VercelBrowserAdapter))
  assert.equal(registered.metadata.providerId, 'vercel')
  assert.equal(registered.metadata.health.lifecycle, 'registered')
  assert.ok(registered.metadata.capabilities.every(c => c.readOnly && !c.environments.includes('production')))
  assert.ok(registered.metadata.capabilities.some(c => c.channels.includes('browser')))
  const files = await readdir(new URL('../lib/provider-framework/', import.meta.url))
  for (const file of files.filter(name => name.endsWith('.ts'))) {
    const text = await readFile(new URL(`../lib/provider-framework/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /browser-runtime|SupervisorDispatcher|policy-engine|fetch\(|XMLHttpRequest|@vercel|stripe|cloudflare|github|supabase-js/i)
  }
})

test('future provider classes fit without architectural changes', () => {
  const ids = ['github','stripe','cloudflare','supabase','aws','azure','google-cloud','namecheap']
  const registry = new UniversalProviderRegistry()
  for (const id of ids) registry.register(sdk(provider({ providerId: id, displayNameKey: `universalProvider.future.${id}.displayName`, descriptionKey: `universalProvider.future.${id}.description` })))
  assert.deepEqual(registry.list().map(p => p.metadata.providerId), ids.sort())
})

test('localization keys exist for all universal provider operator strings', async () => {
  const keys = ['universalProvider.operator.ownerTeam','universalProvider.operator.documentation','universalProvider.vercel.description']
  for (const locale of ['en','es','pt','pl','ru']) {
    const dict = JSON.parse(await readFile(new URL(`../locales/${locale}.json`, import.meta.url), 'utf8'))
    for (const key of keys) assert.ok(key.split('.').reduce((value, part) => value?.[part], dict), `${locale}:${key}`)
  }
})
