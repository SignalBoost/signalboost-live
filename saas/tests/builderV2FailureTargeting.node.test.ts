import test from 'node:test'
import assert from 'node:assert/strict'
import {BuilderV2Agent} from '../lib/builder/agent-v2.ts'
import {BuilderV2Dispatcher} from '../lib/builder/agent-v2-dispatcher.ts'
import {InMemoryBuilderWorkspace} from '../lib/builder/workspace.ts'

test('V2 exposes the exact failed test and its imported module instead of unrelated reads',async()=>{
 const workspace=new InMemoryBuilderWorkspace()
 const id='target-recovery'
 await workspace.writeFile(id,'src/orders.js','module.exports = {}\n')
 await workspace.writeFile(id,'test/orders.test.js',"const {createOrders}=require('../src/orders.js')\n")
 await workspace.writeFile(id,'package.json','{"scripts":{"test":"node --test test/*.test.js"}}')
 const replies=[
  JSON.stringify({type:'tool',action:{tool:'read_file',path:'package.json'}}),
  JSON.stringify({type:'tool',action:{tool:'run_tests',command:'npm test'}}),
 ]
 const prompts:string[]=[]
 const ai={async generate({prompt}:{prompt:string}){prompts.push(prompt);return replies.shift()??JSON.stringify({type:'finish',summary:'not fixed'})}}
 const runner={async run(){return {exitCode:1,stdout:"test at test/orders.test.js:75:1\nTypeError: createOrders is not a function",stderr:'',timedOut:false}}}
 const agent=new BuilderV2Agent(ai,new BuilderV2Dispatcher(workspace,runner),workspace)
 await agent.run({workspaceId:id,objective:'Repair the orders module and run npm test.',maxSteps:3})
 const last=prompts.map(p=>JSON.parse(p)).find(p=>p.openFiles?.['src/orders.js'])
 assert.ok(last,'failed source must be present without a model read')
 assert.equal(last.openFiles['src/orders.js'],'module.exports = {}\n')
 assert.match(last.openFiles['test/orders.test.js'],/createOrders/)
})
