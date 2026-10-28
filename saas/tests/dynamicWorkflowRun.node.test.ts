import assert from 'node:assert/strict'
import test from 'node:test'
import {claimDynamicWorkflowStep,completeDynamicWorkflowStep,nextDynamicWorkflowStep,recoverDynamicWorkflowRun,startDynamicWorkflowRun} from '../lib/agentic/dynamicWorkflowRun.ts'
import {validateDynamicWorkflowDefinition} from '../lib/agentic/dynamicWorkflowDefinition.ts'
const definition=validateDynamicWorkflowDefinition({id:'support',version:1,description:'Customer resolution',steps:[{id:'research',capability:'research',dependsOn:[]},{id:'verify',capability:'verify',dependsOn:['research']}]},new Set(['research','verify']))
test('run progresses only with host receipts and completes after every step',()=>{
 let run=startDynamicWorkflowRun(definition,3)
 assert.equal(run.definitionRevision,3)
 assert.equal(nextDynamicWorkflowStep(run,definition),'research')
 run=claimDynamicWorkflowStep(run,'research',definition)
 assert.equal(nextDynamicWorkflowStep(run,definition),null)
 assert.throws(()=>completeDynamicWorkflowStep(run,'verify','fake',definition),/receipt_invalid/)
 run=completeDynamicWorkflowStep(run,'research','receipt-r1',definition)
 assert.equal(nextDynamicWorkflowStep(run,definition),'verify')
 run=claimDynamicWorkflowStep(run,'verify',definition)
 run=completeDynamicWorkflowStep(run,'verify','receipt-v1',definition)
 assert.equal(run.status,'completed')
 assert.deepEqual(run.completedSteps,['research','verify'])
 assert.equal(nextDynamicWorkflowStep(run,definition),null)
})
test('serialized active step recovers blocked rather than replaying effects',()=>{
 const run=claimDynamicWorkflowStep(startDynamicWorkflowRun(definition,1),'research',definition)
 const recovered=recoverDynamicWorkflowRun(JSON.parse(JSON.stringify(run)))
 assert.equal(recovered.status,'blocked')
 assert.equal(recovered.inFlightStep,'research')
 assert.equal(nextDynamicWorkflowStep(recovered,definition),null)
})
test('serialized completed step resumes at the next unmet dependency',()=>{
 let run=claimDynamicWorkflowStep(startDynamicWorkflowRun(definition,2),'research',definition)
 run=completeDynamicWorkflowStep(run,'research','receipt-123',definition)
 const restored=recoverDynamicWorkflowRun(JSON.parse(JSON.stringify(run)))
 assert.equal(nextDynamicWorkflowStep(restored,definition),'verify')
 assert.throws(()=>claimDynamicWorkflowStep(restored,'research',definition),/not_ready/)
})
