// saas/tests/portableLicenseEvidence.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePortableLicenseEvidence } from '../lib/portable-products/license-evidence.ts'

const base = Object.freeze({
  productId: 'provider-hub',
  tenantId: 'tenant-1',
  environmentId: 'production-us',
  capability: 'provider-connections',
  decision: 'entitled',
  entitlementReference: 'urn:portable:entitlement:example',
  evaluatedAt: '2026-07-26T21:00:00.000Z',
  expiresAt: '2027-07-26T21:00:00.000Z',
  readOnly: true,
  checkoutInvoked: false,
  billingMutationPerformed: false,
  entitlementMutationPerformed: false,
  credentialTransferred: false,
  productionExecutionEnabled: false,
})

test('validates immutable read-only entitlement evidence', () => {
  const result = validatePortableLicenseEvidence(base)
  assert.equal(result.state, 'license_evidence_validated')
  assert.deepEqual(result.blockers, [])
  assert.equal(result.decision, 'entitled')
  assert.equal(result.entitlementReference, base.entitlementReference)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.blockers))
})

test('accepts safe URL and opaque URN entitlement references', () => {
  for (const entitlementReference of ['urn:portable:entitlement:example', 'https://license.example.test/evidence/123']) {
    const result = validatePortableLicenseEvidence({ ...base, entitlementReference })
    assert.equal(result.state, 'license_evidence_validated')
    assert.equal(result.entitlementReference, entitlementReference)
  }
})

test('permits pending and not-entitled decisions without entitlement references', () => {
  for (const decision of ['pending', 'not-entitled'] as const) {
    const result = validatePortableLicenseEvidence({ ...base, decision, entitlementReference: '' })
    assert.equal(result.state, 'license_evidence_validated')
    assert.deepEqual(result.blockers, [])
  }
})

test('fails closed for unknown products, malformed scope, missing references, and unsafe mutation state', () => {
  const result = validatePortableLicenseEvidence({
    ...base,
    productId: 'unknown-product',
    tenantId: '',
    capability: 'Bad Capability',
    entitlementReference: 'https://example.test/?token=secret',
    billingMutationPerformed: true,
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('identity'))
  assert.ok(result.blockers.includes('scope'))
  assert.ok(result.blockers.includes('reference'))
  assert.ok(result.blockers.includes('unsafe-state'))
})

test('rejects invalid decision and reversed timestamps', () => {
  const result = validatePortableLicenseEvidence({
    ...base,
    decision: 'active',
    expiresAt: '2025-07-26T21:00:00.000Z',
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('decision'))
  assert.ok(result.blockers.includes('timestamps'))
})
