import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startDynamicWorkflowRun, claimDynamicWorkflowStep, recoverDynamicWorkflowRun } from '../lib/agentic/dynamicWorkflowRun.ts'
import { validateDynamicWorkflowDefinition } from '../lib/agentic/dynamicWorkflowDefinition.ts'
import { evaluateTaskOutcome } from '../lib/ai/cos/answerTaskContract.ts'

const source = (path:string) => readFileSync(join(process.cwd(),path),'utf8')
const definition=validateDynamicWorkflowDefinition({id:'customer_task',version:1,description:'Existing workflow',steps:[{id:'research',capability:'research',dependsOn:[]}]},new Set(['research']))

test('gate 1 diagnostic: current workflow state has identity but lacks canonical immutable objective contract',()=>{
 const existing=source('lib/agent-runtime/workflow-state.ts')
 assert.match(existing,/readonly workflowId: string; readonly requestId: string; readonly userId: string; readonly idempotencyKey: string/)
 assert.doesNotMatch(existing,/immutable_objective|completed_actions_ledger|final_verification_result/)
})
test('gate 3 partial: declarative plan cannot register unapproved capabilities',()=>{
 assert.throws(()=>validateDynamicWorkflowDefinition({id:'bad',version:1,description:'',steps:[{id:'write',capability:'delete_everything',dependsOn:[]}]},new Set(['research'])),/unregistered_capability/)
})
test('gate 6 partial: executable proof does not turn missing execution evidence into success',()=>{
 const verdict=evaluateTaskOutcome({originalRequest:'Deploy feature and verify production',answer:'Tests passed; deployment READY',requiresExecutionEvidence:true,receipts:[{kind:'test',reference:'ci:123',verified:true}]})
 assert.notEqual(verdict.status,'verified')
 assert.ok(verdict.blockers.includes('verified_execution_receipt_missing'))
})
test('gate 7 partial: interrupted claimed step fails closed instead of replaying',()=>{
 const run=claimDynamicWorkflowStep(startDynamicWorkflowRun(definition,1),'research',definition)
 assert.equal(recoverDynamicWorkflowRun(run).status,'blocked')
})
test.todo('gate 1 E2E: COS, Builder and History share one persisted immutable customer task and execution identity')
test.todo('gate 2 CI caller inventory: all module authorities classified and no parallel customer task record')
test.todo('gate 3 E2E: consequential tools denied by host-side policy despite agent replanning')
test.todo('gate 4 staging: provider accepted effect then worker crash; reconcile by action id without duplicate effect')
test.todo('gate 5 staging: failed plan replans preserving immutable objective, receipts, budget and grants')
test.todo('gate 6 staging: passing Builder tests with broken deployed feature remains incomplete')
test.todo('gate 7 staging: browser disconnect and worker restart recover the same task without re-POST')
test.todo('gate 8 Playwright: customer History Stop Resume Results control authoritative job and show evidence')
test.todo('gate 9 staging: real DB, provider and worker failure-injection receipts retained')
test.todo('gate 10 production: low-risk canary rollout and verified automatic rollback')
