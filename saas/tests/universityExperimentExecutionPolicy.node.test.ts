import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideUniversityExecution, type UniversityExecutionRequest } from '../lib/ai/cos/universityExperimentExecutionPolicy.ts'

const automatic: UniversityExecutionRequest = { kind: 'automatic' }
const experiment: UniversityExecutionRequest = {
  kind: 'experiment', experimentId: 'experiment-a', organizationId: 'tenant-a',
  authorizedOrganizationId: 'tenant-a', verifiedByHarness: true, budgetReserved: true,
  activeExperimentId: null,
}

test('automatic intake remains paused while deliberate experiment is allowed', () => {
  assert.equal(decideUniversityExecution(true, true, automatic), 'line_paused')
  assert.equal(decideUniversityExecution(true, true, experiment), 'allow')
})
test('unknown pause state fails closed for both paths', () => {
  assert.equal(decideUniversityExecution(false, false, automatic), 'pause_unknown')
  assert.equal(decideUniversityExecution(false, false, experiment), 'pause_unknown')
})
test('unpaused automatic intake is allowed', () => {
  assert.equal(decideUniversityExecution(false, true, automatic), 'allow')
})
test('unverified or cross-tenant experiments cannot bypass pause', () => {
  assert.equal(decideUniversityExecution(true, true, { ...experiment, verifiedByHarness: false }), 'experiment_not_authorized')
  assert.equal(decideUniversityExecution(true, true, { ...experiment, authorizedOrganizationId: 'tenant-b' }), 'experiment_not_authorized')
  assert.equal(decideUniversityExecution(true, true, { ...experiment, experimentId: '' }), 'experiment_not_authorized')
})
test('experiment requires reserved budget and exclusive experiment scope', () => {
  assert.equal(decideUniversityExecution(true, true, { ...experiment, budgetReserved: false }), 'experiment_not_reserved')
  assert.equal(decideUniversityExecution(true, true, { ...experiment, activeExperimentId: 'experiment-b' }), 'experiment_conflict')
  assert.equal(decideUniversityExecution(true, true, { ...experiment, activeExperimentId: 'experiment-a' }), 'allow')
})
