// saas/tests/portableSupportBoundaryEvidence.cases.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePortableSupportBoundaryEvidence } from '../lib/portable-products/support-boundary-evidence.ts'

const base = Object.freeze({
  productId: 'provider-hub',
  tenantId: 'tenant-1',
  environmentId: 'production-us',
  supportOwner: 'Portable Support Team',
  serviceWindow: 'business-hours-us-eastern',
  responseTargets: ['severity-1:4h', 'severity-2:1-business-day'],
  escalationPathReference: 'urn:portable:support:escalation:provider-hub',
  maintenancePolicyReference: 'https://support.example.test/policies/provider-hub',
  exclusions: ['buyer-provider-outages', 'buyer-credential-rotation'],
  evaluatedAt: '2026-07-26T21:30:00.000Z',
  acknowledgedAt: '2026-07-26T21:31:00.000Z',
  buyerAcknowledged: true,
  ticketOpened: false,
  providerContacted: false,
  configurationMutated: false,
  deploymentPerformed: false,
  productionExecutionEnabled: false,
})

test('validates immutable support boundary evidence', () => {
  const result = validatePortableSupportBoundaryEvidence(base)
  assert.equal(result.state, 'support_boundary_validated')
  assert.deepEqual(result.blockers, [])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.responseTargets))
  assert.ok(Object.isFrozen(result.exclusions))
  assert.ok(Object.isFrozen(result.blockers))
})

test('fails closed for unknown products, malformed scope, incomplete coverage, and unsafe references', () => {
  const result = validatePortableSupportBoundaryEvidence({
    ...base,
    productId: 'unknown-product',
    tenantId: '',
    supportOwner: '',
    responseTargets: [],
    escalationPathReference: 'https://support.example.test/path?token=secret',
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('identity'))
  assert.ok(result.blockers.includes('scope'))
  assert.ok(result.blockers.includes('coverage'))
  assert.ok(result.blockers.includes('references'))
})

test('rejects duplicate coverage, missing acknowledgment, reversed timestamps, and side effects', () => {
  const result = validatePortableSupportBoundaryEvidence({
    ...base,
    responseTargets: ['severity-1:4h', 'severity-1:4h'],
    acknowledgedAt: '2026-07-25T21:31:00.000Z',
    buyerAcknowledged: false,
    ticketOpened: true,
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('coverage'))
  assert.ok(result.blockers.includes('timestamps'))
  assert.ok(result.blockers.includes('acknowledgment'))
  assert.ok(result.blockers.includes('unsafe-state'))
})
