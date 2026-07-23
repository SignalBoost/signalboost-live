import test from 'node:test'
import assert from 'node:assert/strict'
import { ProductionBrowserLaunchProfileProvider } from '../lib/browser-runtime/production-launch-profile.ts'
import { BrowserProviderRegistry } from '../lib/browser-provider/provider-registry.ts'
import { VercelBrowserAdapter } from '../lib/browser-provider/vercel/index.ts'
import { VercelProductionBrowserAdapter } from '../lib/browser-provider/vercel/vercel-production-adapter.ts'

const ADAPTER = 'signalboost.provider.production.v1'
const base = { adapterId: ADAPTER, provider: 'demo', allowedOrigins: ['https://dashboard.example.com'] }
const req = (o: Record<string, unknown> = {}) => ({ provider: 'demo', adapterId: ADAPTER, mode: 'observe', allowedOrigins: ['https://dashboard.example.com'], ...o }) as never

test('production profile: construction rejects unsafe origins', () => {
  assert.throws(() => new ProductionBrowserLaunchProfileProvider({ ...base, allowedOrigins: [] }))
  assert.throws(() => new ProductionBrowserLaunchProfileProvider({ ...base, allowedOrigins: ['http://dashboard.example.com'] }))
  assert.throws(() => new ProductionBrowserLaunchProfileProvider({ ...base, allowedOrigins: ['https://localhost'] }))
  assert.ok(new ProductionBrowserLaunchProfileProvider(base))
})

test('production profile: read-only by default, execute_change refused', () => {
  const p = new ProductionBrowserLaunchProfileProvider(base)
  assert.ok(p.resolve(req({ mode: 'observe' })))
  assert.ok(p.resolve(req({ mode: 'prepare_change' })))
  assert.throws(() => p.resolve(req({ mode: 'execute_change' })), /read-only/)
})

test('production profile: execute_change allowed only when explicitly enabled', () => {
  const p = new ProductionBrowserLaunchProfileProvider({ ...base, allowExecuteChange: true })
  assert.ok(p.resolve(req({ mode: 'execute_change' })))
})

test('production profile: rejects wrong adapter, provider, and off-allowlist origins', () => {
  const p = new ProductionBrowserLaunchProfileProvider(base)
  assert.throws(() => p.resolve(req({ adapterId: 'other' })))
  assert.throws(() => p.resolve(req({ provider: 'someone-else' })))
  assert.throws(() => p.resolve(req({ allowedOrigins: ['https://evil.example.com'] })))
  assert.throws(() => p.resolve(req({ allowedOrigins: ['http://dashboard.example.com'] })))
  assert.throws(() => p.resolve(req({ allowedOrigins: ['https://127.0.0.1'] })))
})

function productionProvider() {
  const clone = (arr: readonly { providerId: string }[]) => arr.map(x => ({ ...x, providerId: 'prodtest' }))
  return {
    ...VercelBrowserAdapter,
    providerId: 'prodtest',
    supportsProduction: () => true,
    capabilities: clone(VercelBrowserAdapter.capabilities) as never,
    origins: clone(VercelBrowserAdapter.origins) as never,
    navigationProfiles: clone(VercelBrowserAdapter.navigationProfiles) as never,
    selectors: clone(VercelBrowserAdapter.selectors) as never,
    verificationProfiles: clone(VercelBrowserAdapter.verificationProfiles) as never,
    evidenceProfiles: clone(VercelBrowserAdapter.evidenceProfiles) as never,
  } as never
}

test('registry gate: default-off rejects a production-claiming provider', () => {
  assert.throws(() => new BrowserProviderRegistry().register(productionProvider()), /invalid_provider/)
})

test('registry gate: allowProduction=true admits a production provider', () => {
  const registry = new BrowserProviderRegistry({ allowProduction: true })
  registry.register(productionProvider())
  assert.equal(registry.list().some(p => p.providerId === 'prodtest'), true)
})

test('production Vercel adapter: rejected by a default registry, admitted by a production one', () => {
  assert.throws(() => new BrowserProviderRegistry().register(VercelProductionBrowserAdapter), /invalid_provider/)
  const registry = new BrowserProviderRegistry({ allowProduction: true })
  registry.register(VercelProductionBrowserAdapter)
  assert.equal(registry.list().some(p => p.providerId === 'vercel-production'), true)
})

test('production and sandbox Vercel adapters coexist and are distinct', () => {
  assert.equal(VercelBrowserAdapter.supportsProduction(), false)
  assert.equal(VercelProductionBrowserAdapter.supportsProduction(), true)
  const registry = new BrowserProviderRegistry({ allowProduction: true })
  registry.register(VercelBrowserAdapter)
  registry.register(VercelProductionBrowserAdapter)
  assert.equal(registry.list().length, 2)
})
