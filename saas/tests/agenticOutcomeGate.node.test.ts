import test from 'node:test'
import assert from 'node:assert/strict'
import { decideOutcome } from '../lib/agentic/outcomeGate.ts'
test('a model claim without a verified receipt cannot complete work', () => {
  const result = decideOutcome({requirements:['implementation'],satisfied:['implementation'],verifiedReceipts:0,lastStepChangedEvidence:false,repeatedUnproductiveSteps:0,budgetRemaining:true})
  assert.equal(result.status,'continue')
})
test('verified completion needs every requirement', () => {
  const input={requirements:['files','tests'],satisfied:['files'],verifiedReceipts:1,lastStepChangedEvidence:true,repeatedUnproductiveSteps:0,budgetRemaining:true}
  assert.deepEqual(decideOutcome(input).outstanding,['tests'])
  assert.equal(decideOutcome(input).status,'continue')
  assert.equal(decideOutcome({...input,satisfied:['files','tests']}).status,'complete')
})
test('stagnation changes strategy and budget exhaustion stops', () => {
  const base={requirements:['tests'],satisfied:[],verifiedReceipts:0,lastStepChangedEvidence:false,repeatedUnproductiveSteps:2,budgetRemaining:true}
  assert.equal(decideOutcome(base).status,'change-strategy')
  assert.equal(decideOutcome({...base,budgetRemaining:false}).status,'stop-budget')
})
