import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {builderV2Acceptance} from '../../saas/lib/builder/agent-v2.ts'
const r=spawnSync('python3',['verification/builder/v2-proof-symbolic.py'],{encoding:'utf8'})
assert.equal(r.status,0,r.stderr)
const cases=JSON.parse(r.stdout)
const objective='Create these files:\n- app.js\n\nRun:\nnode --test app.js\n\nWrite at least 1 tests.'
for(const {flags,expected} of cases) {
 const name=Object.values(flags).map(Number).join('')
 test('Z3 Builder V2 proof '+name,()=>{
  const receipt={tool:'run_tests',ok:flags.claimed_ok,changed:false,
   output:{requestedCommand:flags.command_match?'node --test app.js':'node wrong.js',
    executedCommand:flags.command_match?'node --test app.js':'node wrong.js',
    exitCode:flags.exit_zero?0:1,timedOut:!flags.not_timed_out,
    stdout:'ℹ pass 1\nℹ fail 0\n'}}
  const steps=flags.after_change?
   [{tool:'write_file',ok:true,changed:true},receipt]:
   [receipt,{tool:'write_file',ok:true,changed:true}]
  const result=builderV2Acceptance(objective,flags.files_complete?['app.js']:[],steps)
  assert.equal(result.satisfied,expected,JSON.stringify(flags))
 })
}
test('falsified zero-exit metadata cannot authorize a completed V2 job',()=>{
 const receipt={tool:'run_tests',ok:true,changed:false,output:{
  requestedCommand:'node --test app.js',executedCommand:'node --test app.js',
  stdout:'ℹ pass 1\nℹ fail 0\n',exitCode:1,timedOut:false}}
 const result=builderV2Acceptance(objective,['app.js'],[{tool:'write_file',ok:true,changed:true},receipt])
 assert.equal(result.satisfied,false)
})
