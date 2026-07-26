// saas/tests/portableBuyerConfigurationEvidence.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePortableBuyerConfigurationEvidence } from '../lib/portable-products/buyer-configuration-evidence.ts'

const base = Object.freeze({
  productId: 'provider-hub',
  tenantId: 'tenant-1',
  environmentId: 'production-us',
  requirements: ['provider-account', 'vault-reference', 'environment-policy'],
  configurationReference: 'urn:portable:configuration:provider-hub',
  credentialReference: 'urn:vault:reference:provider-hub',
  validationReference: 'https://evidence.example.test/configuration/provider-hub',
  evaluatedAt: '2026-07-26T21:00:00.000Z',
  expiresAt: '2027-07-26T21:00:00.000Z',
  readOnly: true,
  secretValueAccessed: false,
  credentialTransferred: false,
  configurationMutationPerformed: false,
  providerExecutionEnabled: false,
  deploymentPerformed: false,
  productionExecutionEnabled: false,
})

test('validates immutable buyer configuration evidence', () => {
  const result = validatePortableBuyerConfigurationEvidence(base)
  assert.equal(result.state, 'buyer_configuration_evidence_validated')
  assert.deepEqual(result.blockers, [])
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.requirements))
  assert.ok(Object.isFrozen(result.references))
})

test('fails closed for unknown products, duplicate requirements, unsafe references, and mutation state', () => {
  const result = validatePortableBuyerConfigurationEvidence({
    ...base,
    productId: 'unknown-product',
    requirements: ['vault-reference', 'vault-reference'],
    credentialReference: 'https://example.test/?token=secret',
    secretValueAccessed: true,
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('identity'))
  assert.ok(result.blockers.includes('requirements'))
  assert.ok(result.blockers.includes('references'))
  assert.ok(result.blockers.includes('unsafe-state'))
  assert.equal(result.references.credential, '')
  assert.equal(result.secretValueAccessed, false)
})

test('rejects malformed scope and expired evidence', () => {
  const result = validatePortableBuyerConfigurationEvidence({
    ...base,
    tenantId: '',
    expiresAt: '2025-07-26T21:00:00.000Z',
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('scope'))
  assert.ok(result.blockers.includes('timestamps'))
})
