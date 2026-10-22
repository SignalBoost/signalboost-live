import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {builderV2IdleSliceCount} from '../lib/builder/agent-v2.ts'
const base={version:2,workspaceId:'w',objectiveDigest:'o',workspaceDigest:'d',steps:[],revision:22,verifiedRevision:-1,unproductive:5,lastReceipt:''} as const
test('V2 stops requeueing three consecutive empty slices',()=>{
 let prior:any={...base,idleSlices:0}
 for(let n=1;n<=3;n++){
  const count=builderV2IdleSliceCount(prior,{...prior})
  assert.equal(count,n)
  prior={...prior,idleSlices:count}
 }
 assert.equal(prior.idleSlices>=3,true)
})
test('new receipts or source revisions reset consecutive-idle counter',()=>{
 const prior:any={...base,idleSlices:2}
 assert.equal(builderV2IdleSliceCount(prior,{...prior,revision:23}),0)
 assert.equal(builderV2IdleSliceCount(prior,{...prior,steps:[{tool:'read_file',ok:true,changed:false}]}),3)
 assert.equal(builderV2IdleSliceCount(null,prior),0)
})

test('read-only and failed-run receipts cannot reset the idle limit',()=>{
 const prior:any={...base,idleSlices:2}
 const steps=[
  {tool:'list_files',ok:true,changed:false},
  {tool:'read_file',ok:true,changed:false},
  {tool:'search_files',ok:true,changed:false},
  {tool:'run_tests',ok:false,changed:false,output:{exitCode:1,timedOut:false}},
 ]
 assert.equal(builderV2IdleSliceCount(prior,{...prior,steps}),3)
})
test('actual source changes and successful authoritative verification reset the limit',()=>{
 const prior:any={...base,idleSlices:2}
 assert.equal(builderV2IdleSliceCount(prior,{...prior,steps:[{tool:'edit_file',ok:true,changed:true}],revision:23}),0)
 assert.equal(builderV2IdleSliceCount(prior,{...prior,steps:[{tool:'run_tests',ok:true,changed:false,output:{exitCode:0,timedOut:false}}]}),0)
 assert.equal(builderV2IdleSliceCount(prior,{...prior,steps:[{tool:'run_tests',ok:true,changed:false,output:{exitCode:1,timedOut:false}}]}),3)
})

test('V2 idle continuation uses checkpoint-derived recovery guidance instead of repeating the same prompt', () => {
  const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')
  assert.match(source, /saved\?\.idleSlices \? \{ continuationRecovery:/)
  assert.match(source, /Do not list files or finish\. Write the named missingRequiredFiles/)
  assert.match(source, /continuationRecovery:[\s\S]*?idleSlices: saved\.idleSlices/)
})
