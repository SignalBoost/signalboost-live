import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePortableDeploymentAcceptanceEvidence } from '../lib/portable-products/deployment-acceptance-evidence.ts'

const checks = [
  'clean-install',
  'configuration-validation',
  'health-check',
  'rollback-readiness',
  'buyer-signoff',
].map(kind => ({ kind, status: 'passed', evidenceReference: `urn:portable:acceptance:${kind}` }))

const base = Object.freeze({
  productId: 'provider-hub',
  tenantId: 'tenant-1',
  environmentId: 'production-us',
  releaseVersion: '1.0.0',
  checks,
  evaluatedAt: '2026-07-26T21:30:00.000Z',
  acknowledgedAt: '2026-07-26T21:31:00.000Z',
  buyerAccepted: true,
  buyerSignoffReference: 'urn:portable:acceptance:buyer-signoff',
  readOnly: true,
  deploymentPerformed: false,
  infrastructureMutationPerformed: false,
  credentialTransferred: false,
  providerExecutionPerformed: false,
  productionExecutionEnabled: false,
})

test('validates immutable deployment acceptance evidence', () => {
  const result = validatePortableDeploymentAcceptanceEvidence(base)
  assert.equal(result.state, 'deployment_acceptance_evidence_validated')
  assert.deepEqual(result.blockers, [])
  assert.equal(result.checks.length, 5)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.checks))
})

test('fails closed when a required check is missing or duplicated', () => {
  const result = validatePortableDeploymentAcceptanceEvidence({
    ...base,
    checks: [...checks.slice(0, 4), checks[0]],
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('checks'))
})

test('rejects unsafe references and reversed acknowledgment timestamps', () => {
  const result = validatePortableDeploymentAcceptanceEvidence({
    ...base,
    checks: checks.map((check, index) => index === 0 ? { ...check, evidenceReference: 'https://example.test/?token=secret' } : check),
    acknowledgedAt: '2026-07-26T21:29:00.000Z',
  })
  assert.ok(result.blockers.includes('references'))
  assert.ok(result.blockers.includes('timestamps'))
})

test('rejects unknown products, malformed scope, missing signoff, and unsafe execution state', () => {
  const result = validatePortableDeploymentAcceptanceEvidence({
    ...base,
    productId: 'unknown-product',
    tenantId: '',
    environmentId: 'bad environment',
    buyerAccepted: false,
    buyerSignoffReference: '',
    deploymentPerformed: true,
  })
  assert.ok(result.blockers.includes('identity'))
  assert.ok(result.blockers.includes('scope'))
  assert.ok(result.blockers.includes('acknowledgment'))
  assert.ok(result.blockers.includes('unsafe-state'))
})
