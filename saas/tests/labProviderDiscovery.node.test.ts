import test from 'node:test'
import assert from 'node:assert/strict'
import { LAB_PROVIDER_DISCOVERY } from '../lib/lab/providerDiscovery.ts'
import { LAB_PROVIDER_CATALOG } from '../lib/ai/cos/labCustomerProviderCatalog.ts'
import { LAB_CREDENTIAL_KINDS } from '../lib/ai/cos/labCustomerCredentialVault.ts'
import { readFileSync } from 'node:fs'

test('all advertised operational providers are backed by allowed credential kinds', () => {
  for (const p of LAB_PROVIDER_CATALOG) assert.ok(LAB_CREDENTIAL_KINDS.includes(p.kind))
})
test('discovery includes requested popular AI, GPU and development providers, Universal last', () => {
  for (const p of ['xai','deepseek','qwen','ollama','copilot','lovable','runpod','deepinfra','vast','modal','lambda']) {
    assert.ok(LAB_PROVIDER_DISCOVERY.some(item => item.id === p), p)
  }
  assert.equal(LAB_PROVIDER_DISCOVERY.at(-1)?.id,'universal')
  assert.ok(LAB_PROVIDER_DISCOVERY.every(p => p.status === 'planned'))
  assert.equal(new Set(LAB_PROVIDER_DISCOVERY.map(x=>x.id)).size,LAB_PROVIDER_DISCOVERY.length)
})
test('unimplemented providers cannot be selected or saved', () => {
  const ui = readFileSync(new URL('../app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../app/api/lab/providers/route.ts', import.meta.url), 'utf8')
  assert.match(ui, /disabled>\{item.name\} — Coming soon/)
  assert.match(ui, /!catalog.some\(item => item.kind === keyKind\)/)
  assert.match(api, /LAB_CREDENTIAL_KINDS/)
  assert.match(api, /catalog: LAB_PROVIDER_CATALOG, discovery: LAB_PROVIDER_DISCOVERY/)
})
