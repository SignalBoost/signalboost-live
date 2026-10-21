import assert from 'node:assert/strict'
import test from 'node:test'
import { builderFinalProof } from '../lib/builder/final-proof.ts'
import type { BuilderAcceptanceLedger } from '../lib/builder/acceptance-ledger.ts'

const objective = [
  'Create a new private GitHub repository and open a pull request.',
  'GET /sum?a=2&b=3',
  'Expected response:',
  '```json',
  '{"total":5}',
  '```',
  'Maximum AI inference spending: $0.50 USD',
  'Maximum total execution time: 10 minutes.',
].join('\n')
const acceptance: BuilderAcceptanceLedger = {
  applicable: true, passed: true, failureCode: null,
  commands: [{ command: 'npm test', passed: true, receiptIndex: 4, exitCode: 0 }],
  initialFailureReproduced: true, latestSourceChangeIndex: 3,
}
const publication = {
  repository: 'SignalBoost/builder-123', repositoryCreated: true, repositoryPrivate: true,
  pullRequestUrl: 'https://github.com/SignalBoost/builder-123/pull/1',
  commitSha: 'a'.repeat(40), mergeCommitSha: 'b'.repeat(40),
  previewUrl: 'https://test.vercel.app',
  endpointUrl: 'https://test.vercel.app/sum?a=2&b=3',
  status: 'verified', httpStatus: 200, responseBody: { total: 5 },
}
const budget = {
  maxInferenceUsd: 0.5, accountedInferenceUsd: 0.04,
  pendingReservationUsd: 0.03, elapsedMs: 360000, priceCeilingBreached: false,
}
const proof = (overrides: Record<string, unknown> = {}) => builderFinalProof({
  objective, workspaceVerified: true, acceptance, publication,
  publicationError: null, budget, requiresPublication: true,
  ...overrides,
})

test('verified host-backed publication and requested endpoint pass', () => {
  const result = proof()
  assert.equal(result.passed, true)
  assert.ok(Object.values(result.criteria).every(Boolean))
})

test('README/homepage smoke is not equivalent to requested endpoint proof', () => {
  assert.equal(proof({ publication: { ...publication, endpointUrl: 'https://test.vercel.app/' } }).criteria.endpoint, false)
})

test('matching HTTP 200 with wrong JSON must fail', () => {
  assert.equal(proof({ publication: { ...publication, responseBody: { total: 4 } } }).passed, false)
})

test('deployment READY alone never counts as API acceptance', () => {
  assert.equal(proof({ publication: { ...publication, status: 'READY', httpStatus: undefined } }).passed, false)
})

test('a shared existing private repository cannot meet new-repository requirement', () => {
  const result = proof({ publication: { ...publication, repositoryCreated: false } })
  assert.equal(result.passed, false)
  assert.equal(result.failureCode, 'builder_final_newPrivateRepository_unverified')
})

test('publication must include verified merge and real PR URL', () => {
  assert.equal(proof({ publication: { ...publication, mergeCommitSha: undefined } }).criteria.publication, false)
})

test('inference reserved plus spent must remain within hard cap', () => {
  assert.equal(proof({ budget: { ...budget, pendingReservationUsd: 0.48 } }).criteria.budget, false)
})

test('missing budget or exceeded deadline cannot pass explicit 10-minute budget contract', () => {
  assert.equal(proof({ budget: null }).passed, false)
  assert.equal(proof({ budget: { ...budget, elapsedMs: 601000 } }).criteria.deadline, false)
})

test('test verification cannot be overridden by publication success', () => {
  assert.equal(proof({ acceptance: { ...acceptance, passed: false } }).criteria.hostTests, false)
})
