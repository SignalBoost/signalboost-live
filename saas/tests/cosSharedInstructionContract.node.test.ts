import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileCosInstructionContract, decideCosLoopContinuation } from '../lib/ai/cos/instructionContract.ts'
import { isConciergeBuilderObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

test('forensic prompt prohibits Builder even when supplied with source/log evidence', () => {
  const prompt = 'You are an incident commander. Do NOT write code, create files, or generate a project. Only investigate.\n1. List plausible causes.\n2. Rank causes by likelihood.\n3. Design forensic experiments.'
  const contract = compileCosInstructionContract(prompt)
  assert.equal(contract.mode,'analysis-only')
  assert.equal(contract.deliverables.length,3)
  assert.equal(isConciergeBuilderObjective(prompt,{attachmentNames:['src/orders.ts']}),false)
})
test('affirmative coding instructions retain Builder authorization', () => {
  const prompt = 'Build a Node.js application and create a project with package.json, src/index.js, and tests/index.test.js; run npm test.'
  assert.equal(compileCosInstructionContract(prompt).prohibitsExecution,false)
  assert.equal(isConciergeBuilderObjective(prompt),true)
})
test('loop progress and budget are distinguished from repeated no-op behavior', () => {
  assert.equal(decideCosLoopContinuation({repeatedUnproductiveSteps:2,latestStepChangedArtifact:false,latestStepAddedEvidence:false,budgetRemaining:true}),'change-strategy')
  assert.equal(decideCosLoopContinuation({repeatedUnproductiveSteps:10,latestStepChangedArtifact:true,latestStepAddedEvidence:false,budgetRemaining:true}),'continue')
  assert.equal(decideCosLoopContinuation({repeatedUnproductiveSteps:0,latestStepChangedArtifact:false,latestStepAddedEvidence:true,budgetRemaining:true}),'continue')
  assert.equal(decideCosLoopContinuation({repeatedUnproductiveSteps:1,latestStepChangedArtifact:true,latestStepAddedEvidence:true,budgetRemaining:false}),'stop-budget')
})
test('Builder ingress enforces shared instruction contract', () => {
  const source=readFileSync(new URL('../app/api/builder/route.ts',import.meta.url),'utf8')
  assert.ok(source.includes('compileCosInstructionContract(objective).prohibitsExecution'))
})
