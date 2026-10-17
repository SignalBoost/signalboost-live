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
 assert.equal(builderV2IdleSliceCount(prior,{...prior,steps:[{tool:'read_file',ok:true,changed:false}]}),0)
 assert.equal(builderV2IdleSliceCount(null,prior),0)
})
