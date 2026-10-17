import test from 'node:test'
import assert from 'node:assert/strict'
import {BuilderV2Agent} from '../lib/builder/agent-v2.ts'
import {BuilderV2Dispatcher} from '../lib/builder/agent-v2-dispatcher.ts'
import {InMemoryBuilderWorkspace} from '../lib/builder/workspace.ts'

const runner={async run(){return {exitCode:0,stdout:'ℹ pass 1\nℹ fail 0\n',stderr:'',timedOut:false}}}
const caps={actions:['open','goto','snapshot','find','console','requests','close'] as const, allowedOrigins:['https://itmounts.com']}
test('V2 browser inspection delegates to sandbox only after exact origin authorization',async()=>{
 let calls=0
 const browser={
  async capabilities(){return caps},
  async invoke({action}:{action:string}){calls++;return {ok:true,action:'snapshot' as const,exitCode:0,stdout:'page rendered',stderr:'',timedOut:false}},
  async close(){}
 }
 const dispatch=new BuilderV2Dispatcher(new InMemoryBuilderWorkspace(),runner,undefined,browser)
 const ok=await dispatch.dispatch('user:x',{tool:'browser_cli',action:'snapshot',url:'https://itmounts.com/'})
 assert.equal(ok.ok,true);assert.equal(calls,1)
 const bad=await dispatch.dispatch('user:x',{tool:'browser_cli',action:'goto',url:'https://evil.example'})
 assert.equal(bad.error,'builder_browser_origin_denied');assert.equal(calls,1)
 const insecure=await dispatch.dispatch('user:x',{tool:'browser_cli',action:'goto',url:'http://itmounts.com'})
 assert.equal(insecure.error,'builder_browser_origin_denied');assert.equal(calls,1)
})
test('browser failures remain failures and guide bounded repair',async()=>{
 const browser={
  async capabilities(){return caps},
  async invoke(){return {ok:false,action:'snapshot' as const,exitCode:1,stdout:'',stderr:'browser error',timedOut:false,failureCode:'navigation_failed' as const}},
  async close(){}
 }
 const receipt=await new BuilderV2Dispatcher(new InMemoryBuilderWorkspace(),runner,undefined,browser)
  .dispatch('user:x',{tool:'browser_cli',action:'snapshot',url:'https://itmounts.com'})
 assert.equal(receipt.ok,false)
 assert.equal(receipt.error,'builder_browser_verification_failed')
 assert.deepEqual(receipt.next,['read_file','edit_file','run_tests'])
})
test('V2 rejects browser actions when browser port is not configured',async()=>{
 const receipt=await new BuilderV2Dispatcher(new InMemoryBuilderWorkspace(),runner)
  .dispatch('user:x',{tool:'browser_cli',action:'snapshot'})
 assert.equal(receipt.error,'builder_browser_unavailable')
})
test('V2 parses browser action and records a real browser receipt',async()=>{
 const browser={
  async capabilities(){return caps},
  async invoke(){return {ok:true,action:'snapshot' as const,exitCode:0,stdout:'ok',stderr:'',timedOut:false}},
  async close(){}
 }
 let calls=0
 const agent=new BuilderV2Agent({async generate(){calls++;return JSON.stringify({type:'tool',action:{tool:'browser_cli',action:'snapshot',url:'https://itmounts.com'}})}},
  new BuilderV2Dispatcher(new InMemoryBuilderWorkspace(),runner,undefined,browser))
 const outcome=await agent.run({workspaceId:'u',objective:'Inspect the current application in the browser.',maxSteps:1})
 assert.equal(calls,1)
 assert.equal(outcome.steps.some(x=>x.tool==='browser_cli'&&x.ok),true)
})
