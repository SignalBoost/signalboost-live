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

test('explicit browser verification cannot be replaced by passing tests alone',async()=>{
 const {builderV2Acceptance}=await import('../lib/builder/agent-v2.ts')
 const objective='Create these files:\n- app.js\n\nRun:\nnode --test app.js\n\nWrite at least 1 tests.\nBrowser verify https://itmounts.com.'
 const write={tool:'write_file' as const,ok:true,changed:true}
 const run={tool:'run_tests' as const,ok:true,changed:false,output:{
   requestedCommand:'node --test app.js',executedCommand:'node --test app.js',
   exitCode:0,timedOut:false,stdout:'ℹ pass 1\nℹ fail 0\n'}}
 const browser=(ok:boolean,url='https://itmounts.com')=>({
   tool:'browser_cli' as const,ok,changed:false,
   output:{url,exitCode:ok?0:1,timedOut:false},
 })
 assert.equal(builderV2Acceptance(objective,['app.js'],[write,run]).satisfied,false)
 assert.equal(builderV2Acceptance(objective,['app.js'],[write,run,browser(false)]).satisfied,false)
 assert.equal(builderV2Acceptance(objective,['app.js'],[write,run,browser(true,'https://other.test')]).satisfied,false)
 assert.equal(builderV2Acceptance(objective,['app.js'],[write,run,browser(true)]).satisfied,true)
 assert.equal(builderV2Acceptance(objective,['app.js'],[write,run,browser(true),browser(false)]).satisfied,false)
 assert.equal(builderV2Acceptance(objective,['app.js'],[write,run,browser(true),write]).satisfied,false)
})
