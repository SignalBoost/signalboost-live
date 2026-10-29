import test from 'node:test'
import assert from 'node:assert/strict'
import { refusedRequestedExecution } from '../lib/ai/cos/cosExecutionVerdict.ts'
test('explicit inability to run PAC cannot count as completed execution', () => {
 assert.equal(refusedRequestedExecution('I cannot execute the Production Acceptance Campaign (iTMounts-PAC-001).'), true)
 assert.equal(refusedRequestedExecution('I am unable to perform live testing.'), true)
 assert.equal(refusedRequestedExecution('I cannot verify the policy, but here is the legal provision.'), false)
 assert.equal(refusedRequestedExecution('Completed the requested test with a verified report.'), false)
})
