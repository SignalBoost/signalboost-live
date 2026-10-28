import test from 'node:test'
import assert from 'node:assert/strict'
import { beginAgenticTask, advanceAgenticTask, outstandingAgenticRequirements } from '../lib/agentic/taskLifecycle.ts'

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
