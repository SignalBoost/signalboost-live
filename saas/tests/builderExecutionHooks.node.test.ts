import test from 'node:test'
import assert from 'node:assert/strict'
import {withBuilderExecutionHooks} from '../lib/builder/execution-hooks.ts'
const input={workspaceId:'ws',command:'npm test',files:[]}
const success={exitCode:0,stdout:'passed',stderr:'',timedOut:false}
test('pre-run authorization veto prevents delegated command',async()=>{
 let executions=0
 const runner=withBuilderExecutionHooks({async run(){executions++;return success}},{
  beforeRun(){throw Error('host_denied')},
 })
 await assert.rejects(runner.run(input),/host_denied/)
 assert.equal(executions,0)
})
test('post-run observes actual result and cannot change authoritative exit code',async()=>{
 const events=[]
 const runner=withBuilderExecutionHooks({async run(){events.push('execute');return success}},{
  beforeRun(){events.push('before')},
  afterRun({result}){assert.equal(result.exitCode,0);events.push('after')},
 })
 assert.deepEqual(await runner.run(input),success)
 assert.deepEqual(events,['before','execute','after'])
})
test('post-run observation failure does not invent test failure',async()=>{
 const log=console.error
 console.error=()=>{}
 try {
 const runner=withBuilderExecutionHooks({async run(){return success}},{afterRun(){throw Error('telemetry_down')}})
 assert.equal((await runner.run(input)).exitCode,0)
 } finally {console.error=log}
})
test('delegated runtime failure is preserved',async()=>{
 const runner=withBuilderExecutionHooks({async run(){throw Error('sandbox_failure')}},{})
 await assert.rejects(runner.run(input),/sandbox_failure/)
})

test('failed commands retain true exit status while emitting post-run evidence',async()=>{
 const events=[]
 const failure={exitCode:1,stdout:'',stderr:'AssertionError',timedOut:false}
 const runner=withBuilderExecutionHooks({async run(){events.push('run');return failure}},{
  beforeRun(){events.push('before')},
  afterRun({result}){events.push('after');assert.equal(result.exitCode,1)}
 })
 assert.equal((await runner.run(input)).exitCode,1)
 assert.deepEqual(events,['before','run','after'])
})
test('runtime exception emits an error hook without replacing original failure',async()=>{
 const events=[]
 const failure=new Error('sandbox_crashed')
 const runner=withBuilderExecutionHooks({async run(){throw failure}},{
  onError({error}){events.push(error)}
 })
 await assert.rejects(runner.run(input),err=>err===failure)
 assert.deepEqual(events,['sandbox_crashed'])
})
test('broken error hook does not suppress original sandbox failure',async()=>{
 const old=console.error;console.error=()=>{}
 try{
  const runner=withBuilderExecutionHooks({async run(){throw Error('actual_error')}},{
   onError(){throw Error('telemetry_error')}
  })
  await assert.rejects(runner.run(input),/actual_error/)
 }finally{console.error=old}
})
test('asynchronous host veto prevents execution',async()=>{
 let executions=0
 const runner=withBuilderExecutionHooks({async run(){executions++;return success}},{
  async beforeRun(){await Promise.resolve();throw Error('policy_denied')}
 })
 await assert.rejects(runner.run(input),/policy_denied/)
 assert.equal(executions,0)
})

test('BuilderToolLoop delegates real run actions through trusted host hooks',async()=>{
 const {BuilderToolLoop}=await import('../lib/builder/tool-loop.ts')
 const {InMemoryBuilderWorkspace}=await import('../lib/builder/workspace.ts')
 const events=[]
 let replies=[JSON.stringify({type:'tool',toolId:'run',input:{command:'node app.js'}})]
 const loop=new BuilderToolLoop(
  {async generate(){return replies.shift()??null}},
  new InMemoryBuilderWorkspace(),
  {async run(){events.push('execute');return success}},
  undefined,undefined,
  {beforeRun({command}){assert.equal(command,'node app.js');events.push('before')},
   afterRun({result}){assert.equal(result.exitCode,0);events.push('after')}}
 )
 await loop.run({objective:'Run app.js and inspect its output.',workspaceId:'rea:hooks:integration',maxRounds:1})
 assert.deepEqual(events,['before','execute','after'])
})
