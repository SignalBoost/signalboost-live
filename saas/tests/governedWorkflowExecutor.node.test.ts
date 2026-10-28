import assert from 'node:assert/strict'
import test from 'node:test'
import {executeGovernedWorkflowStep} from '../lib/agentic/governedWorkflowExecutor.ts'
import {startDynamicWorkflowRun} from '../lib/agentic/dynamicWorkflowRun.ts'
import {validateDynamicWorkflowDefinition} from '../lib/agentic/dynamicWorkflowDefinition.ts'
const definition=validateDynamicWorkflowDefinition({id:'support',version:1,description:'Support',steps:[{id:'check',capability:'verify',dependsOn:[]}]},new Set(['verify']))
test('persisted claim precedes execution receipt',async()=>{
 let generation=0
 let state=startDynamicWorkflowRun(definition,1)
 const store={
  async load(){return {generation,state}},
  async save(_id:string,expected:number,next:typeof state){assert.equal(expected,generation);generation++;state=next;return generation},
 }
 let calls=0
 const result=await executeGovernedWorkflowStep({runId:'test',definition,store,authorize:async()=>true,capabilities:{verify:async()=>{
  calls++
  assert.equal(state.inFlightStep,'check')
  assert.equal(generation,1)
  return {id:'receipt-1',verified:true}
 }}})
 assert.equal(calls,1)
 assert.equal(result.state.status,'completed')
 assert.equal(result.generation,2)
})
