import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION,
  BrowserProviderRegistry,
  VercelBrowserAdapter,
  createBrowserProviderDiagnosticsSnapshot,
} from '../lib/browser-provider/index.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


test('BPAL diagnostics snapshot is deterministic, detached, and deeply frozen', () => {
  const first = createBrowserProviderDiagnosticsSnapshot()
  const second = createBrowserProviderDiagnosticsSnapshot()

  assert.equal(first.schemaVersion, BROWSER_PROVIDER_DIAGNOSTICS_SCHEMA_VERSION)
  assert.equal(first.productionExecutionEnabled, false)
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  assert.ok(Object.isFrozen(first))
  assert.ok(Object.isFrozen(first.providers))

  const provider = first.providers[0]
  assert.ok(provider)
  assert.equal(provider.providerId, 'vercel')
  assert.equal(provider.support.productionExecutionEnabled, false)
  assert.equal(provider.worker.maximumConcurrentWork, 0)
  assert.deepEqual(provider.worker.executionDependencies, [])
  assert.ok(Object.isFrozen(provider))
  assert.ok(Object.isFrozen(provider.capabilities))
  assert.throws(() => (first.providers as unknown as unknown[]).push(null), /read only|not extensible|object is not extensible/i)
})

test('BPAL policy review exposes only read-only, non-production capability metadata', () => {
  const snapshot = createBrowserProviderDiagnosticsSnapshot()
  const provider = snapshot.providers[0]
  assert.ok(provider)

  for (const capability of provider.capabilities) {
    assert.equal(capability.readOnly, true)
    assert.equal(capability.riskClass, 'read_only')
    assert.equal(capability.productionExecutionEnabled, false)
    assert.equal(capability.allowedEnvironments.includes('production'), false)
    assert.equal(capability.supportsAutoFailover, false)
    assert.ok(capability.verificationProfileId)
    assert.ok(capability.evidenceProfileId)
    assert.ok(capability.allowedOriginIds.length > 0)
  }
})

test('BPAL registration fails closed before diagnostics can expose a production adapter', () => {
  const registry = new BrowserProviderRegistry()
  assert.throws(
    () => registry.register({ ...VercelBrowserAdapter, supportsProduction: () => true }),
    /invalid_provider/,
  )
  assert.deepEqual(registry.list(), [])
})

test('Supervisor provider diagnostics page is admin-gated and contains no execution controls', async () => {
  const source = await readFile(new URL('../app/dashboard/supervisor/providers/page.tsx', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  assert.match(source, /getCurrentUser/)
  assert.match(source, /access\.isAdmin/)
  assert.match(source, /productionBrowserExecutionDisabled/)
  assert.doesNotMatch(source, /<form|<button|action=|fetch\(|playwright|credential|secret/i)
})

test('Supervisor provider diagnostics labels are available in all five operator languages', async () => {
  const locales = ['en', 'es', 'pt', 'pl', 'ru']
  const keys = [
    'supervisorHa.providerWorker',
    'supervisorHa.executionMethod',
    'supervisorHa.capabilityMaturity',
    'supervisorHa.policyVersion',
    'supervisorHa.humanApprovalRequired',
    'supervisorHa.productionBrowserExecutionDisabled',
    'supervisorApprovals.provider',
    'supervisorApprovals.targetOrigin',
    'supervisorApprovals.riskLevel',
    'supervisorApprovals.verificationRequirements',
    'supervisorApprovals.evidence',
    'supervisorApprovals.approvalStatus',
  ]

  for (const locale of locales) {
    const dict = JSON.parse(await readFile(new URL(`../locales/${locale}.json`, import.meta.url), 'utf8').then(hydrateLocalizedSource))
    for (const key of keys) {
      const value = key.split('.').reduce((current, part) => current?.[part], dict)
      assert.equal(typeof value, 'string', `${locale}:${key}`)
      assert.ok(value.length > 0, `${locale}:${key}`)
    }
  }
})
