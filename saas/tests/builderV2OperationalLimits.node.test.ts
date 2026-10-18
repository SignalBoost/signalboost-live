import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderV2Agent } from '../lib/builder/agent-v2.ts'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { builderJobOverTotalDeadline, BUILDER_JOB_TOTAL_DEADLINE_MS, BUILDER_JOB_MODEL_CALL_BUDGET } from '../lib/builder/work-budget.ts'
const objective = 'Build src/a.js and test/a.test.js and run npm test'
const reply = JSON.stringify({type:'tool',action:{tool:'list_files'}})
test('whole-job deadline includes original creation timestamp',()=> { const now=Date.now(); assert.equal(builderJobOverTotalDeadline(new Date(now-BUILDER_JOB_TOTAL_DEADLINE_MS-1).toISOString(),now),true); assert.equal(builderJobOverTotalDeadline(new Date(now-1000).toISOString(),now),false) })
test('invalid creation timestamp fails closed',()=>assert.equal(builderJobOverTotalDeadline('invalid',Date.now()),true))
test('default model-call ceiling is set',()=>assert.equal(BUILDER_JOB_MODEL_CALL_BUDGET,60))
test('model-call budget terminates repeated reads and persists across resume',async()=>{const workspace=new InMemoryBuilderWorkspace(); await workspace.writeFile('w','src/a.js','module.exports=1'); let calls=0; const agent=new BuilderV2Agent({async generate(){calls++;return reply}},new BuilderV2Dispatcher(workspace,{async run(){return {exitCode:1,stdout:'',stderr:'',timedOut:false}}}),workspace); const first=await agent.run({workspaceId:'w',objective,maxSteps:20,modelCallBudget:3}); assert.equal(first.reason,'builder_v2_model_call_budget_exhausted'); assert.equal(first.checkpoint?.modelCalls,3); const second=await agent.run({workspaceId:'w',objective,maxSteps:20,modelCallBudget:3,checkpoint:first.checkpoint}); assert.equal(second.reason,'builder_v2_model_call_budget_exhausted');assert.equal(calls,3)})
