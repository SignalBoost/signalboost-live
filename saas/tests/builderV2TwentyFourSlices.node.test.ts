import test from 'node:test'
import assert from 'node:assert/strict'
import {BuilderV2Agent,validateBuilderV2ReceiptHistory} from '../lib/builder/agent-v2.ts'
import {BuilderV2Dispatcher} from '../lib/builder/agent-v2-dispatcher.ts'
import {InMemoryBuilderWorkspace} from '../lib/builder/workspace.ts'

test('24 resumed slices do not accept a failed suite or corrupt a checkpoint',async()=>{
 const ws=new InMemoryBuilderWorkspace()
 const id='twenty-four-slices'
 await ws.writeFile(id,'package.json',JSON.stringify({scripts:{test:'node --test'}}))
 await ws.writeFile(id,'test/orders.test.js',"const {createOrders}=require('../src/orders.js')\n")
 await ws.writeFile(id,'src/orders.js','module.exports = {}\n')
 const objective='Repair the OrderFlow implementation. Run npm test.'
 const dispatcher=new BuilderV2Dispatcher(ws,{async run(){return {
  exitCode:1,stderr:'TypeError: createOrders is not a function\n at test/orders.test.js:76:18',
  stdout:'',timedOut:false
 }}})
 let checkpoint
 let initialFailed=false
 for(let slice=0;slice<24;slice++){
  const ai={async generate({prompt}:{prompt:string}){
   const ctx=JSON.parse(prompt)
   if(slice>0 && !ctx.openFiles?.['src/orders.js']) throw Error('failure source missing from recovery')
   if(slice===0&&!initialFailed){initialFailed=true;return JSON.stringify({type:'tool',action:{tool:'run_tests',command:'npm test'}})}
   return JSON.stringify({type:'tool',action:{tool:'read_file',path:'test/orders.test.js'}})
  }}
  const out=await new BuilderV2Agent(ai,dispatcher,ws).run({
   workspaceId:id,objective,checkpoint,maxSteps:1
  })
  assert.equal(out.ok,false,'a failing suite cannot become success')
  assert.ok(out.checkpoint,'checkpoint required')
  assert.ok(validateBuilderV2ReceiptHistory(out.checkpoint),'checkpoint invariant violated')
  checkpoint=out.checkpoint
 }
 assert.ok(checkpoint)
 const runs=checkpoint.steps.filter(x=>x.tool==='run_tests')
 assert.equal(runs.length,1,'failed unchanged suite must not be re-executed')
 assert.equal(runs[0].ok,false)
})
