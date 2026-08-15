import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApiCapability } from '../lib/supervisor/executors/api-capability-registry.ts'
import { createSelfHealingPortableCapabilityDescriptor } from '../lib/supervisor/portable/self-healing-capability-policy.ts'

function capability(overrides: Partial<ApiCapability> = {}): ApiCapability {
  return {
    provider: 'example-cloud',
    actionId: 'action',
    mutation: false,
    riskClass: 'read_only',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['GET'],
    resourcePattern: /^\/$/,
    validateParameters: () => true,
    ...overrides,
  }
}

function descriptor(api: ApiCapability, metadata?: Record<string, string | number | boolean | null>) {
  return createSelfHealingPortableCapabilityDescriptor({
    capability: api,
    connectionId: 'buyer-connection',
    tenantId: 'buyer-tenant',
    environmentId: 'production',
    metadata,
  })
}

test('registered read-only observation remains unattended', () => {
  const result = descriptor(capability())
  assert.equal(result.risk, 'read')
  assert.equal(result.requiresApproval, false)
})

test('registered routine reversible repair remains unattended', () => {
  const result = descriptor(capability({
    actionId: 'restart-service',
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['POST'],
  }))
  assert.equal(result.risk, 'write')
  assert.equal(result.requiresApproval, false)
})

test('buyer can require approval without misclassifying a routine repair as consequential', () => {
  const result = descriptor(capability({
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: true,
    autoExecutable: true,
    methods: ['POST'],
  }))
  assert.equal(result.risk, 'write')
  assert.equal(result.requiresApproval, true)
})

test('non-auto-executable routine repair stays write-risk but fails closed behind approval', () => {
  const result = descriptor(capability({
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: false,
    autoExecutable: false,
    methods: ['POST'],
  }))
  assert.equal(result.risk, 'write')
  assert.equal(result.requiresApproval, true)
})

test('consequential and internally inconsistent capabilities are approval gated', () => {
  const consequential = descriptor(capability({
    mutation: true,
    riskClass: 'consequential',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['POST'],
  }))
  assert.equal(consequential.risk, 'consequential')
  assert.equal(consequential.requiresApproval, true)

  const inconsistentRead = descriptor(capability({
    mutation: true,
    riskClass: 'read_only',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['POST'],
  }))
  assert.equal(inconsistentRead.risk, 'consequential')
  assert.equal(inconsistentRead.requiresApproval, true)
})

test('caller metadata cannot forge authoritative Self-Healing governance facts', () => {
  const result = descriptor(capability({
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: true,
    autoExecutable: false,
    methods: ['POST'],
  }), {
    selfHealingRiskClass: 'read_only',
    autoExecutable: true,
    approvalRequired: false,
    mutation: false,
    note: 'buyer metadata is still preserved',
  })

  assert.deepEqual(result.metadata, {
    selfHealingRiskClass: 'routine_reversible',
    autoExecutable: false,
    approvalRequired: true,
    mutation: true,
    note: 'buyer metadata is still preserved',
  })
})
