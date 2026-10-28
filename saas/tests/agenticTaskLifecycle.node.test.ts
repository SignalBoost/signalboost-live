import test from 'node:test'
import assert from 'node:assert/strict'
import { beginAgenticTask, advanceAgenticTask, outstandingAgenticRequirements, validateDynamicWorkflow } from '../lib/agentic/taskLifecycle.ts'

test('unverified claims cannot complete an agentic task', () => {
 const state=beginAgenticTask('Repair the source and prove the change', ['source','tests'])
 assert.equal(state.status,'working')
 assert.deepEqual(outstandingAgenticRequirements(state),['source','tests'])
})
test('host receipts fulfill individual requirements and survive JSON checkpoint replay', () => {
 const task=beginAgenticTask('Build and test', ['source','tests'])
 const changed=advanceAgenticTask(task,{type:'receipt',id:'write:1',satisfies:['source']})
 const reloaded=JSON.parse(JSON.stringify(changed))
 const complete=advanceAgenticTask(reloaded,{type:'receipt',id:'test:exit0',satisfies:['tests']})
 assert.equal(complete.status,'completed')
 assert.deepEqual(complete.receipts,['write:1','test:exit0'])
})
test('duplicate receipts are ignored and no-progress calls switch strategy', () => {
 const task=beginAgenticTask('Repair', ['tests'])
 const first=advanceAgenticTask(task,{type:'receipt',id:'test:failed'})
 assert.equal(advanceAgenticTask(first,{type:'receipt',id:'test:failed'}),first)
 const stuck=advanceAgenticTask(advanceAgenticTask(first,{type:'no-progress'}),{type:'no-progress'})
 assert.equal(stuck.status,'change-strategy')
 assert.equal(advanceAgenticTask(stuck,{type:'budget-exhausted'}).status,'blocked-budget')
})

test('dynamic workflow validates an advisory research sequence without granting execution', () => {
 const def={id:'retirement-advice',version:1,objective:'Answer age-65 extension question',steps:[
  {id:'research',capability:'research',dependsOn:[]},
  {id:'verify',capability:'verify',dependsOn:['research']},
  {id:'answer',capability:'answer',dependsOn:['verify']},
 ]}
 const result=validateDynamicWorkflow(JSON.parse(JSON.stringify(def)),['research','verify','answer'])
 assert.equal(result.valid,true)
 assert.equal(result.executionAuthorized,false)
})
test('dynamic workflow refuses unknown tools, injected code, missing dependencies and cycles', () => {
 const base={id:'builder-repair',version:1,objective:'Repair project with approval',steps:[
  {id:'build',capability:'builder',dependsOn:['test'],requiresApproval:true},
  {id:'test',capability:'verify',dependsOn:['build']},
 ]}
 const result=validateDynamicWorkflow(base,['builder','verify'])
 assert.equal(result.valid,false)
 assert.ok(result.errors.includes('cycle_detected'))
 const injected=validateDynamicWorkflow({...base,steps:[{id:'steal',capability:'shell',dependsOn:[],execute:'rm -rf /'}]},['builder','verify'])
 assert.ok(injected.errors.includes('unregistered_capability'))
 assert.ok(injected.errors.includes('unexpected_step_field'))
 assert.equal(injected.executionAuthorized,false)
})
