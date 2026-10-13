// saas/tests/builderPastedTestFailureEvidence.node.test.ts
//
// Production 2026-10-13: an owner repair started with list_files and a refused `npm test`, then wandered (a passing
// agentGateway run, repeated npm test) until it stalled. The host pins the exact failing test as the first proof only
// when it recognizes one in the pasted evidence, and it recognized only the "✖ failing tests: test at tests/…" summary
// and plainly typed paths. Raw node:test output ("not ok N" + "location: '…/tests/x.test.ts:L:C'") and a stack trace
// into a test file named the failing test too, but yielded no proof command.
import assert from 'node:assert/strict'
import test from 'node:test'
import { signalBoostDeployedRepairTarget } from '../lib/builder/repository-repair-target.ts'
import { repositoryRepairProofCommand } from '../lib/builder/repository-repair-proof-controller.ts'

const DEPLOYED = { commitSha: 'a'.repeat(40), branch: 'main' }
const PINNED = 'node --experimental-strip-types --test tests/agentGateway.node.test.ts'
const proofFor = (evidence: string) => {
  const target = signalBoostDeployedRepairTarget(evidence, DEPLOYED, { ownerRepairWithoutSource: true })
  return target ? repositoryRepairProofCommand(target) : 'no-target'
}

test('raw node:test output pins the failing test file from its location line', () => {
  assert.equal(proofFor(`npm test fails:
TAP version 13
ok 1 - an allowlisted reversible action executes
not ok 2 - a FINANCIAL action is categorically halted for a human
  ---
  duration_ms: 1.2
  location: '/home/runner/work/signalboost-live/saas/tests/agentGateway.node.test.ts:38:1'
  failureType: 'testCodeFailure'
  error: 'Expected values to be strictly equal'
  ...
# fail 1`), PINNED)
})

test('a stack trace into a test file pins that test when the evidence shows a failure', () => {
  assert.equal(proofFor(`Repair it, the test crashes:
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
'notice' !== 'halt'
    at TestContext.<anonymous> (file:///tmp/cos-signalboost-repair/saas/tests/agentGateway.node.test.ts:41:10)
    at async Test.run (node:internal/test_runner/test:1054:7)`), PINNED)
})

test('the existing summary and typed-path forms are unchanged', () => {
  assert.equal(proofFor('Fix this:\n✖ failing tests:\ntest at tests/agentGateway.node.test.ts:38:1\n✖ a FINANCIAL action (1.2ms)'), PINNED)
  assert.equal(proofFor('Fix the failing test tests/agentGateway.node.test.ts, the financial halt assertion fails'), PINNED)
})

test('evidence that names no failing test pins nothing', () => {
  assert.equal(proofFor('Fix the power stabilization release gate so the advisory diagnosis answer is correct.'), null)
  // A passing run lists test files only in module warnings; that is not a failure.
  assert.equal(proofFor(`Fix the concierge reply language.
(node:13) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///vercel/path0/saas/tests/agentGateway.node.test.ts is not specified
ok 1 - an allowlisted reversible action executes
# fail 0`), null)
  // A stack frame inside a test file with no failure in the evidence is not a failing test.
  assert.equal(proofFor(`Fix the concierge reply language.
console.warn: retrying
    at helper (file:///tmp/x/saas/tests/agentGateway.node.test.ts:12:3)`), null)
})
// end of saas/tests/builderPastedTestFailureEvidence.node.test.ts (if this line is missing, the paste was cut short)
