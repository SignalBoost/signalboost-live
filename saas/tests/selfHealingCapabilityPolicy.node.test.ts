import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApiCapability } from '../lib/supervisor/executors/api-capability-registry.ts'
import { createSelfHealingPortableCapabilityDescriptor } from '../lib/supervisor/portable/self-healing-capability-policy.ts'

function capability(overrides: Partial<ApiCapability>): ApiCapability {
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

function descriptor(api: ApiCapability) {
  return createSelfHealingPortableCapabilityDescriptor({
    capability: api,
    connectionId: 'buyer-connection',
    tenantId: 'buyer-tenant',
    environmentId: 'production',
  })
}

test('read-only observation remains unattended', () => {
  const result = descriptor(capability({}))
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

test('buyer may make a routine action stricter by requiring approval', () => {
  const result = descriptor(capability({
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: true,
    autoExecutable: true,
    methods: ['POST'],
  }))
  assert.equal(result.risk, 'consequential')
  assert.equal(result.requiresApproval, true)
})

test('non-auto-executable and consequential actions remain approval gated', () => {
  const disabledRoutine = descriptor(capability({
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: false,
    autoExecutable: false,
    methods: ['POST'],
  }))
  assert.equal(disabledRoutine.risk, 'consequential')
  assert.equal(disabledRoutine.requiresApproval, true)

  const consequential = descriptor(capability({
    mutation: true,
    riskClass: 'consequential',
    approvalRequired: true,
    autoExecutable: false,
    methods: ['POST'],
  }))
  assert.equal(consequential.risk, 'consequential')
  assert.equal(consequential.requiresApproval, true)
})
