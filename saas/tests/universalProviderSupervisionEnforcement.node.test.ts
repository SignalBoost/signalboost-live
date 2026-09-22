import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(process.cwd())
const REGISTERED_NETWORK_ADAPTERS = [
  'stripe.ts',
  'supabase.ts',
  'cloudflare.ts',
  'aws.ts',
  'azure.ts',
  'google-cloud.ts',
  'namecheap.ts',
] as const

test('registered network adapters may not bypass the canonical supervised executor', () => {
  for (const file of REGISTERED_NETWORK_ADAPTERS) {
    const source = fs.readFileSync(path.join(ROOT, 'lib/provider-framework', file), 'utf8')
    assert.match(source, /executeSupervisedProviderCall/, `${file} must execute through Self-Healing`)
  }
})

test('provider registry remains the canonical onboarding boundary', () => {
  const registry = fs.readFileSync(path.join(ROOT, 'lib/provider-framework/provider-registry-bootstrap.ts'), 'utf8')
  for (const file of REGISTERED_NETWORK_ADAPTERS) {
    const stem = file.replace('.ts', '')
    assert.ok(registry.toLowerCase().includes(stem.replace('-', '')), `${file} should remain registered`)
  }
})
