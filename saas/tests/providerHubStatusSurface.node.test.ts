import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createProviderHubStatusSurface, PROVIDER_HUB_STATUS_SURFACE_VERSION } from '../provider-hub-host/status-surface.ts'

test('Provider Hub status surface returns only allowlisted public metadata', () => {
  const surface = createProviderHubStatusSurface({
    mode: 'self_service', tenantId: 'tenant-1', environmentId: 'production', connectionId: 'connection-1',
    record: {
      user_id: 'user-1', active_provider: 'openai', byok_enabled: true,
      encrypted_keys: { apiKey: { valueEncrypted: 'ciphertext', iv: 'iv', tag: 'tag', last4: '1234' } },
      updated_at: '2026-07-26T00:00:00.000Z',
    },
  })

  assert.equal(surface.schemaVersion, PROVIDER_HUB_STATUS_SURFACE_VERSION)
  assert.equal(surface.connection?.authentication.configured, true)
  assert.deepEqual(surface.connection?.authentication.maskedFields, { apiField: 'saved' })
  const serialized = JSON.stringify(surface)
  for (const forbidden of ['ciphertext', 'valueEncrypted', '"iv"', '"tag"', 'last4', 'email', 'vaultRef', 'roles']) {
    assert.equal(serialized.includes(forbidden), false, `surface must not expose ${forbidden}`)
  }
  assert.deepEqual(Object.keys(surface).sort(), ['allowedActions', 'connection', 'mode', 'notices', 'schemaVersion'])
})

test('Provider Hub status endpoints are GET-only and enforce authentication boundaries', async () => {
  const selfService = await readFile(new URL('../app/api/provider-hub/status/route.ts', import.meta.url), 'utf8')
  const admin = await readFile(new URL('../app/api/admin/provider-hub/status/route.ts', import.meta.url), 'utf8')
  assert.match(selfService, /getAccess\(\)/)
  assert.match(selfService, /status:\s*401/)
  assert.match(admin, /requireOwner\(\)/)
  assert.doesNotMatch(selfService + admin, /export async function (POST|PUT|PATCH|DELETE)|decryptProviderKeys|vaultDecrypt|valueEncrypted/)
})
