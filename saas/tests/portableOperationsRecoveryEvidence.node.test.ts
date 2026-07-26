// saas/tests/portableOperationsRecoveryEvidence.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePortableOperationsRecoveryEvidence } from '../lib/portable-products/operations-recovery-evidence.ts'

const base = Object.freeze({
  productId: 'provider-hub',
  releaseVersion: '1.2.0',
  previousVersion: '1.1.0',
  runbookReference: 'urn:portable:runbook:provider-hub',
  upgradeReference: 'https://docs.example.test/provider-hub/upgrade',
  rollbackReference: 'https://docs.example.test/provider-hub/rollback',
  backupReference: 'https://docs.example.test/provider-hub/backup',
  restoreReference: 'https://docs.example.test/provider-hub/restore',
  recoveryPointObjectiveMinutes: 60,
  recoveryTimeObjectiveMinutes: 120,
  validatedAt: '2026-07-26T21:30:00.000Z',
  expiresAt: '2027-07-26T21:30:00.000Z',
  readOnly: true,
  artifactAccessed: false,
  upgradeExecuted: false,
  rollbackExecuted: false,
  backupExecuted: false,
  restoreExecuted: false,
  deploymentPerformed: false,
  productionExecutionEnabled: false,
})

test('validates immutable operations and recovery evidence', () => {
  const result = validatePortableOperationsRecoveryEvidence(base)
  assert.equal(result.state, 'operations_recovery_evidence_validated')
  assert.deepEqual(result.blockers, [])
  assert.equal(result.references.rollback, base.rollbackReference)
  assert.ok(Object.isFrozen(result))
  assert.ok(Object.isFrozen(result.blockers))
  assert.ok(Object.isFrozen(result.references))
})

test('fails closed for unknown products, invalid versions, objectives, and timestamps', () => {
  const result = validatePortableOperationsRecoveryEvidence({
    ...base,
    productId: 'unknown-product',
    releaseVersion: 'latest',
    previousVersion: 'latest',
    recoveryPointObjectiveMinutes: 0,
    expiresAt: '2025-07-26T21:30:00.000Z',
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('identity'))
  assert.ok(result.blockers.includes('version'))
  assert.ok(result.blockers.includes('objectives'))
  assert.ok(result.blockers.includes('timestamps'))
})

test('rejects unsafe references and any execution or deployment state', () => {
  const result = validatePortableOperationsRecoveryEvidence({
    ...base,
    restoreReference: 'https://docs.example.test/restore?token=secret',
    restoreExecuted: true,
    deploymentPerformed: true,
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('references'))
  assert.ok(result.blockers.includes('unsafe-state'))
  assert.equal(result.references.restore, '')
})
