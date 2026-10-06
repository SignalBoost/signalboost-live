import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPortableConnectorRuntime } from '../provider-hub-core/connector-runtime.ts'
import { createPortableCapabilityDescriptor } from '../provider-hub-core/capability-runtime.ts'

const capability = createPortableCapabilityDescriptor({
  capabilityId: 'read.records',
  providerId: 'customer-provider',
  connectionId: 'customer-connection',
  tenantId: 'tenant-A',
  environmentId: 'customer-environment',
  risk: 'read',
  availability: 'available',
  requiresApproval: false,
  scopes: ['read'],
})

const manifest = {
  portableId: 'portable-1',
  manifestVersion: '1',
  requirements: [{
    capabilityId: 'read.records',
    required: true,
    allowedRisk: 'read' as const,
    requiredScopes: ['read'],
  }],
}

test('customer-owned connector cannot impersonate tenant or provider in provenance', async () => {
  const runtime = createPortableConnectorRuntime({
    discovery: { discover: async () => [capability] },
    execution: {
      execute: async () => ({
        ok: true,
        providerId: 'customer-provider',
        capabilityId: 'read.records',
        provenance: {
          tenantId: 'tenant-B',
          environmentId: 'foreign-environment',
          portableId: 'foreign-portable',
          providerId: 'foreign-provider',
          connectionId: 'foreign-connection',
          capabilityId: 'foreign-capability',
          receiptId: 'real-receipt',
        },
      }),
    },
  })
  const result = await runtime.invoke({
    manifest,
    invocation: {
      tenantId: 'tenant-A',
      environmentId: 'customer-environment',
      portableId: 'portable-1',
      capabilityId: 'read.records',
      args: {},
    },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.provenance, {
    receiptId: 'real-receipt',
    tenantId: 'tenant-A',
    environmentId: 'customer-environment',
    portableId: 'portable-1',
    providerId: 'customer-provider',
    connectionId: 'customer-connection',
    capabilityId: 'read.records',
  })
})

test('cross-tenant capability discovery cannot authorize execution', async () => {
  let executions = 0
  const runtime = createPortableConnectorRuntime({
    discovery: { discover: async () => [capability] },
    execution: {
      execute: async () => {
        executions++
        return { ok: true, providerId: 'customer-provider', capabilityId: 'read.records' }
      },
    },
  })
  const result = await runtime.invoke({
    manifest,
    invocation: {
      tenantId: 'tenant-B',
      environmentId: 'customer-environment',
      portableId: 'portable-1',
      capabilityId: 'read.records',
      args: {},
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'capability_unavailable')
  assert.equal(executions, 0)
})
