import test from 'node:test'
import assert from 'node:assert/strict'
import { validateDynamicWorkflowDefinition } from '../lib/agentic/dynamicWorkflowDefinition.ts'
const tools = new Set(['research','verify'])
const good = {
  id:'customer_support',version:1,description:'Resolve and verify',
  steps:[
    {id:'find',capability:'research',dependsOn:[]},
    {id:'check',capability:'verify',dependsOn:['find']},
  ],
}
test('validates ordered, registered declarative workflow without executable code',()=>{
  const result=validateDynamicWorkflowDefinition(good,tools)
  assert.equal(result.steps[1].dependsOn[0],'find')
  assert.equal(result.version,1)
})
test('rejects unknown capability, malformed IDs and future graph dependencies',()=>{
  assert.throws(()=>validateDynamicWorkflowDefinition({...good,steps:[{id:'find',capability:'shell',dependsOn:[]}]},tools),/unregistered/)
  assert.throws(()=>validateDynamicWorkflowDefinition({...good,id:'../../bad'},tools),/invalid_id/)
  assert.throws(()=>validateDynamicWorkflowDefinition({...good,steps:[{id:'first',capability:'research',dependsOn:['next']}]},tools),/dependency/)
})
test('rejects injected code, unknown fields and unversioned definitions',()=>{
  assert.throws(()=>validateDynamicWorkflowDefinition({...good,run:'process.exit(1)'},tools),/invalid_root/)
  assert.throws(()=>validateDynamicWorkflowDefinition({...good,version:2},tools),/unsupported_version/)
  assert.throws(()=>validateDynamicWorkflowDefinition({...good,steps:[{id:'find',capability:'research',dependsOn:[],execute:'code'}]},tools),/invalid_step/)
})
