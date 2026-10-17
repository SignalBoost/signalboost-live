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
