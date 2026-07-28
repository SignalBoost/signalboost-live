import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  createProviderHubReferenceDeployment,
  createReferenceConnection,
} from '../examples/provider-hub-reference/reference-deployment.ts'
import { createExternalHostProviderHub } from '../examples/provider-hub-reference/external-host-example.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const actor = Object.freeze({
  actorId: 'reference-actor',
  tenantId: 'reference-tenant',
  environmentId: 'sandbox',
  roles: Object.freeze(['administrator']),
})

test('Provider Hub reference deployment composes deterministic scoped host ports', async () => {
  const connection = createReferenceConnection()
  const deployment = createProviderHubReferenceDeployment({ actor, connection })

  assert.equal((await deployment.ports.identity.resolveActor(actor))?.actorId, actor.actorId)
  assert.equal(await deployment.ports.identity.resolveActor({ ...actor, tenantId: 'other-tenant' }), null)

  const resolved = await deployment.ports.persistence.getConnection(connection)
  assert.equal(resolved, connection)
  assert.equal(await deployment.ports.persistence.getConnection({ ...connection, environmentId: 'production' }), null)

  const reference = await deployment.ports.vault.storeSecret({ identity: connection, secretEnvelope: { encrypted: true } })
  assert.match(reference.vaultRef, /^reference-vault:\/\//)
  assert.equal(reference.tenantId, actor.tenantId)
  assert.equal('secret' in reference, false)

  const approval = await deployment.ports.approvals.request({ actor, connection, action: 'rotate', reason: 'test' })
  assert.equal(approval.decision, 'pending')

  assert.equal((await deployment.ports.licensing.checkEntitlement({
    tenantId: actor.tenantId,
    environmentId: actor.environmentId,
    capability: 'provider-hub.view',
  })).entitled, true)
  assert.equal((await deployment.ports.licensing.checkEntitlement({
    tenantId: actor.tenantId,
    environmentId: actor.environmentId,
    capability: 'provider-hub.execute',
  })).entitled, false)

  const event = Object.freeze({
    eventId: 'reference-event',
    eventType: 'connection.viewed',
    actorId: actor.actorId,
    tenantId: actor.tenantId,
    environmentId: actor.environmentId,
    connectionId: connection.connectionId,
    occurredAt: '2026-07-26T00:00:00.000Z',
  })
  await deployment.ports.audit.append(event)
  assert.deepEqual(deployment.auditEvents, [event])

  const projection = deployment.ports.ui.project({ actor, connection, allowedActions: ['view'] })
  assert.deepEqual(projection.allowedActions, ['view'])
  assert.equal(projection.connection.authentication.maskedFields.accountField, 'saved')
})

test('external-host example preserves buyer adapters without SignalBoost coupling', () => {
  const reference = createProviderHubReferenceDeployment({ actor, connection: createReferenceConnection() })
  const external = createExternalHostProviderHub(reference.ports)

  assert.equal(external.identity, reference.ports.identity)
  assert.equal(external.vault, reference.ports.vault)
  assert.equal(external.persistence, reference.ports.persistence)
  assert.equal(external.audit, reference.ports.audit)
  assert.equal(external.approvals, reference.ports.approvals)
  assert.equal(external.licensing, reference.ports.licensing)
  assert.equal(external.ui, reference.ports.ui)
  assert.ok(Object.isFrozen(external))
})

test('reference deployment sources remain execution-free, network-free, and host-neutral', async () => {
  const paths = [
    '../examples/provider-hub-reference/reference-deployment.ts',
    '../examples/provider-hub-reference/external-host-example.ts',
  ]
  const forbidden = [
    'next/', '@supabase', 'vault/crypto', 'execute-runner', 'browser-runtime',
    'fetch(', 'listen(', 'createServer(', 'process.env', 'decrypt', 'getSecret(',
    "decision: 'approved'", 'child_process', 'terraform', 'kubectl',
  ]

  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8').then(hydrateLocalizedSource)
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${path} must not include ${token}`)
    }
  }
})
