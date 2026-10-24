import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {builderV2IdleSliceCount, builderV2DecimalAssertionMismatch} from '../lib/builder/agent-v2.ts'
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

test('V2 recovery escalates repeated failed tests instead of endlessly oscillating edits', () => {
 const source = readFileSync(new URL('../lib/builder/agent-v2.ts', import.meta.url), 'utf8')
 assert.match(source, /failedRuns >= 3/)
 assert.match(source, /Repeated host test failures have already consumed multiple repair rounds/)
 assert.match(source, /floating-point semantics/)
})

test('decimal assertion detector matches actual host error output, not literal backslash sequences', () => {
 const output = [
  'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:',
  '  + actual - expected',
  '  + 0.3',
  '  - 0.30000000000000004',
 ].join('\n')
 assert.equal(builderV2DecimalAssertionMismatch(output), true)
 assert.equal(builderV2DecimalAssertionMismatch('AssertionError: + 4\\n- 5'), false)
 assert.equal(builderV2DecimalAssertionMismatch('0.3 0.30000000000000004'), false)
})

test('Builder chat keeps pending results in the conversation and never reports polling timeout as success', () => {
  const copy = readFileSync(new URL('../lib/ai/cos/assistanceMode.ts', import.meta.url), 'utf8')
  const progress = readFileSync(new URL('../lib/ai/cos/agentProgressClient.ts', import.meta.url), 'utf8')
  const running = copy.slice(copy.indexOf('export const BUILDER_RUNNING: Copy = {'), copy.indexOf('export const COS_TURN_ACCEPTED: Copy = {'))
  assert.doesNotMatch(running, /result will appear in History|resultado aparecerá en el Historial|resultado aparecerá no Histórico/)
  assert.match(running, /finished result will appear in this conversation/)
  // A follow that ends before the job is never a success; the person reads a plain line in their language.
  // The chat never turns an unfinished job into an answer: it keeps checking (more slowly) until the job ends.
  assert.match(progress, /await wait\(slow \? BUILDER_JOB_SLOW_POLL_DELAY_MS : BUILDER_JOB_POLL_DELAY_MS, args\.signal\)/)
  assert.doesNotMatch(progress, /incomplete: true/)
})
