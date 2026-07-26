import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROVIDER_HUB_CONNECTION_SCHEMA_VERSION,
  createProviderConnectionMetadata,
} from '../provider-hub-core/index.ts'
import {
  PROVIDER_HUB_HOST_PORTS_VERSION,
  type ProviderHubHostPorts,
} from '../provider-hub-core/host-ports.ts'
import { createSignalBoostProviderConnectionPort } from '../provider-hub-host/signalboost-provider-config-adapter.ts'

const identity = Object.freeze({
  tenantId: 'tenant-1', environmentId: 'production', connectionId: 'connection-1', providerId: 'openai',
})

function metadata(maskedFields: Record<string, unknown> = { account: '••••2345' }) {
  return createProviderConnectionMetadata({
    ...identity,
    state: 'validated',
    authentication: { method: 'api_key', configured: true, maskedFields },
    updatedAt: '2026-07-25T19:00:00-04:00',
  })
}

test('Provider Hub v1 metadata serializes deterministically and normalizes timestamps', () => {
  const first = metadata()
  const second = metadata()
  assert.equal(first.schemaVersion, PROVIDER_HUB_CONNECTION_SCHEMA_VERSION)
  assert.equal(first.updatedAt, '2026-07-25T23:00:00.000Z')
  assert.equal(JSON.stringify(first), JSON.stringify(second))
  assert.deepEqual(Object.keys(first), ['schemaVersion', 'tenantId', 'environmentId', 'connectionId', 'providerId', 'state', 'authentication', 'updatedAt'])
})

test('Provider Hub rejects secret-shaped names and unsafe public values as a matrix', () => {
  for (const name of ['secret', 'accessToken', 'password', 'private_key', 'credential', 'api-key', 'accessKey']) {
    assert.throws(() => metadata({ [name]: 'saved' }), /secret-shaped public field rejected/)
  }
  for (const value of ['sk-live-123', 'Bearer token', 'plain-text', '••••too-many-characters', '{}']) {
    assert.throws(() => metadata({ account: value }), /unsafe masked value rejected/)
  }
})

test('SignalBoost adapter fails closed for every identity mismatch', async () => {
  let reads = 0
  const port = createSignalBoostProviderConnectionPort({
    async getUserProviderConfig() {
      reads += 1
      return {
        user_id: 'user-1', active_provider: 'openai', byok_enabled: true,
        encrypted_keys: { apiKey: { valueEncrypted: 'cipher', iv: 'iv', tag: 'tag' } },
        updated_at: '2026-07-25T23:00:00.000Z',
      }
    },
  }, candidate => Object.entries(identity).every(([key, value]) => candidate[key as keyof typeof candidate] === value) ? 'user-1' : null)

  for (const mismatch of [
    { tenantId: 'tenant-2' }, { environmentId: 'staging' },
    { connectionId: 'connection-2' }, { providerId: 'anthropic' },
  ]) {
    assert.equal(await port.getConnection({ ...identity, ...mismatch }), null)
  }
  assert.equal(reads, 0, 'cross-scope identities must not reach persistence')
  assert.equal((await port.getConnection(identity))?.providerId, 'openai')
  assert.equal(reads, 1)
})

test('Provider Hub core and host v1 contracts remain composition compatible', () => {
  const connection = metadata()
  const ports = {
    identity: { async resolveActor() { return null }, async resolveConnectionOwner() { return null } },
    vault: { async storeSecret() { throw new Error('disabled') }, async deleteSecret() {} },
    persistence: { async getConnection(candidate) { return candidate.connectionId === connection.connectionId ? connection : null } },
    audit: { async append() {} },
    approvals: { async request() { return { approvalId: 'approval-1', decision: 'pending' as const } } },
    licensing: { async checkEntitlement() { return { entitled: false } } },
    ui: { project({ connection: projected, allowedActions, notices = [] }) {
      return Object.freeze({ schemaVersion: PROVIDER_HUB_HOST_PORTS_VERSION, connection: projected, allowedActions: Object.freeze([...allowedActions]), notices: Object.freeze([...notices]) })
    } },
  } satisfies ProviderHubHostPorts

  assert.equal(PROVIDER_HUB_CONNECTION_SCHEMA_VERSION, 'provider-hub-connection-v1')
  assert.equal(PROVIDER_HUB_HOST_PORTS_VERSION, 'provider-hub-host-ports-v1')
  assert.equal(ports.ui.project({ actor: { actorId: 'actor-1', tenantId: identity.tenantId, environmentId: identity.environmentId, roles: [] }, connection, allowedActions: ['view'] }).connection.schemaVersion, PROVIDER_HUB_CONNECTION_SCHEMA_VERSION)
})
