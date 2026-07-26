import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const componentUrl = new URL('../components/provider-hub/ProviderHubStatusDashboard.tsx', import.meta.url)
const selfServiceUrl = new URL('../app/dashboard/provider-hub/page.tsx', import.meta.url)
const adminUrl = new URL('../app/admin/provider-hub/page.tsx', import.meta.url)

test('Provider Hub dashboards target the authenticated read-only status endpoints', async () => {
  const [selfService, admin] = await Promise.all([
    readFile(selfServiceUrl, 'utf8'),
    readFile(adminUrl, 'utf8'),
  ])

  assert.match(selfService, /endpoint="\/api\/provider-hub\/status"/)
  assert.match(admin, /endpoint="\/api\/admin\/provider-hub\/status"/)
  assert.match(selfService, /ProviderHubStatusDashboard/)
  assert.match(admin, /ProviderHubStatusDashboard/)
})

test('Provider Hub dashboard component remains status-only and secret-free', async () => {
  const source = await readFile(componentUrl, 'utf8')

  assert.match(source, /method:\s*'GET'/)
  assert.match(source, /read-only/i)
  assert.match(source, /never reveals, copies, decrypts, or returns provider credentials/i)

  for (const forbidden of [
    '<form', 'type="password"', 'textarea', 'method: \'POST\'', 'method: \'PUT\'', 'method: \'PATCH\'',
    'method: \'DELETE\'', 'decryptProviderKeys', 'vaultDecrypt', 'valueEncrypted', 'secretEnvelope',
    'navigator.clipboard', 'Reveal', 'Copy credential', 'approve(', 'execute(',
  ]) {
    assert.equal(source.includes(forbidden), false, `status dashboard must not include ${forbidden}`)
  }
})

test('Provider Hub dashboard renders only public status fields', async () => {
  const source = await readFile(componentUrl, 'utf8')
  for (const field of ['providerId', 'state', 'authentication', 'configured', 'maskedFields', 'tenantId', 'environmentId', 'connectionId', 'updatedAt', 'allowedActions', 'notices']) {
    assert.equal(source.includes(field), true, `expected public status field ${field}`)
  }
  for (const forbidden of ['email', 'roles', 'vaultRef', 'apiKey', 'accessToken', 'password']) {
    assert.equal(source.includes(forbidden), false, `dashboard must not reference ${forbidden}`)
  }
})
