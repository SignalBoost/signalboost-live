import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  PROVIDER_HUB_CONNECTION_SCHEMA_VERSION,
  createProviderConnectionMetadata,
} from '../provider-hub-core/index.ts'
import {
  PROVIDER_HUB_HOST_PORTS_VERSION,
  type ProviderHubActorIdentity,
  type ProviderHubAuditEvent,
  type ProviderHubHostPorts,
  type ProviderHubUiProjection,
  type ProviderHubVaultReference,
} from '../provider-hub-core/host-ports.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


test('Provider Hub host ports preserve scoped opaque contracts', async () => {
  const actor: ProviderHubActorIdentity = Object.freeze({
    actorId: 'actor-1', tenantId: 'tenant-1', environmentId: 'production', roles: Object.freeze(['admin']),
  })
  const connection = createProviderConnectionMetadata({
    tenantId: 'tenant-1', environmentId: 'production', connectionId: 'connection-1', providerId: 'openai',
    state: 'configured', authentication: { method: 'api_key', configured: true, maskedFields: { apiField: 'saved' } },
    updatedAt: '2026-07-25T23:00:00.000Z',
  })
  const vaultRef: ProviderHubVaultReference = Object.freeze({
    vaultRef: 'vault://tenant-1/connection-1/1', tenantId: 'tenant-1', environmentId: 'production',
    connectionId: 'connection-1', version: 1,
  })
  const auditEvent: ProviderHubAuditEvent = Object.freeze({
    eventId: 'event-1', eventType: 'connection.viewed', actorId: actor.actorId,
    tenantId: actor.tenantId, environmentId: actor.environmentId, connectionId: connection.connectionId,
    occurredAt: '2026-07-25T23:00:00.000Z', evidenceRef: 'evidence://event-1',
  })
  const projection: ProviderHubUiProjection = Object.freeze({
    schemaVersion: PROVIDER_HUB_HOST_PORTS_VERSION, connection,
    allowedActions: Object.freeze(['view']), notices: Object.freeze(['manual setup available']),
  })

  const ports = {
    identity: {
      async resolveActor() { return actor },
      async resolveConnectionOwner() { return { ownerId: 'actor-1' } },
    },
    vault: {
      async storeSecret() { return vaultRef },
      async deleteSecret() {},
    },
    persistence: { async getConnection() { return connection } },
    audit: { async append(event: Readonly<ProviderHubAuditEvent>) { assert.equal(event, auditEvent) } },
    approvals: { async request() { return { approvalId: 'approval-1', decision: 'pending' as const } } },
    licensing: { async checkEntitlement() { return { entitled: true, entitlementRef: 'license://tenant-1' } } },
    ui: { project() { return projection } },
  } satisfies ProviderHubHostPorts

  assert.equal((await ports.identity.resolveActor({ actorId: 'actor-1', tenantId: 'tenant-1', environmentId: 'production' }))?.tenantId, 'tenant-1')
  assert.equal((await ports.vault.storeSecret({ identity: connection, secretEnvelope: { encrypted: true } })).vaultRef, vaultRef.vaultRef)
  assert.equal((await ports.approvals.request({ actor, connection, action: 'rotate', reason: 'requested' })).decision, 'pending')
  assert.equal(ports.ui.project({ actor, connection, allowedActions: ['view'] }).connection.schemaVersion, PROVIDER_HUB_CONNECTION_SCHEMA_VERSION)
  await ports.audit.append(auditEvent)
})

test('Provider Hub host port source exposes no plaintext secret retrieval or host dependency imports', async () => {
  const source = await readFile(new URL('../provider-hub-core/host-ports.ts', import.meta.url), 'utf8').then(hydrateLocalizedSource)
  for (const forbidden of ['next/', '@supabase', 'vault/crypto', 'execute-runner', 'getSecret(', 'decrypt', 'plaintext']) {
    assert.equal(source.includes(forbidden), false, `host port contract must not include ${forbidden}`)
  }
  assert.equal(/decision:\s*'approved'/.test(source), false, 'contract must not hard-code automatic approval')
})
