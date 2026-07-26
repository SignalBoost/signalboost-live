import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ProviderHubHostAdapterRegistry,
  composeProviderHubHostAdapter,
} from '../provider-hub-core/host-composition.ts'
import type { ProviderHubHostPorts } from '../provider-hub-core/host-ports.ts'

function ports(): ProviderHubHostPorts {
  return {
    identity: {
      async resolveActor() { return null },
      async resolveConnectionOwner() { return null },
    },
    vault: {
      async storeSecret(input) {
        return { ...input.identity, vaultRef: 'vault://opaque', version: 1 }
      },
      async deleteSecret() {},
    },
    persistence: { async getConnection() { return null } },
    audit: { async append() {} },
    approvals: { async request() { return { approvalId: 'approval-1', decision: 'pending' } } },
    licensing: { async checkEntitlement() { return { entitled: false } } },
    ui: {
      project(input) {
        return {
          schemaVersion: 'provider-hub-host-ports-v1',
          connection: input.connection,
          allowedActions: Object.freeze([...input.allowedActions]),
          notices: Object.freeze([...(input.notices ?? [])]),
        }
      },
    },
  }
}

test('composes immutable scoped host adapter with execution disabled', () => {
  const adapter = composeProviderHubHostAdapter({
    hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'production', ports: ports(),
  })
  assert.equal(adapter.schemaVersion, 'provider-hub-host-composition-v1')
  assert.equal(adapter.portsVersion, 'provider-hub-host-ports-v1')
  assert.equal(adapter.automaticApprovalEnabled, false)
  assert.equal(adapter.providerMutationEnabled, false)
  assert.equal(adapter.browserExecutionEnabled, false)
  assert.equal(adapter.infrastructureMutationEnabled, false)
  assert.equal(adapter.productionExecutionEnabled, false)
  assert.equal(Object.isFrozen(adapter), true)
  assert.equal(Object.isFrozen(adapter.ports), true)
})

test('rejects missing required ports', () => {
  const incomplete = { ...ports(), approvals: undefined } as unknown as ProviderHubHostPorts
  assert.throws(() => composeProviderHubHostAdapter({
    hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'test', ports: incomplete,
  }), /missing provider hub host port: approvals/)
})

test('registry isolates tenants and environments and rejects duplicates', () => {
  const registry = new ProviderHubHostAdapterRegistry()
  const production = composeProviderHubHostAdapter({ hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'production', ports: ports() })
  const staging = composeProviderHubHostAdapter({ hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'staging', ports: ports() })
  const otherTenant = composeProviderHubHostAdapter({ hostId: 'signalboost', tenantId: 'tenant-b', environmentId: 'production', ports: ports() })
  registry.register(production)
  registry.register(staging)
  registry.register(otherTenant)

  assert.equal(registry.get({ hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'production' }), production)
  assert.equal(registry.get({ hostId: 'signalboost', tenantId: 'tenant-a', environmentId: 'development' }), null)
  assert.deepEqual(registry.listByHost('signalboost').map(item => [item.tenantId, item.environmentId]), [
    ['tenant-a', 'production'], ['tenant-a', 'staging'], ['tenant-b', 'production'],
  ])
  assert.throws(() => registry.register(production), /duplicate provider hub host adapter registration/)
})
