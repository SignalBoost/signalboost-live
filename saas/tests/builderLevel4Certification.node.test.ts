import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILDER_LEVEL4_OBJECTIVE, evaluateBuilderLevel4 } from '../lib/builder/level4-certification.ts'
import { builderTaskContract } from '../lib/builder/task-contract.ts'
import type { BuilderV2Receipt } from '../lib/builder/agent-v2-dispatcher.ts'
import type { BuilderV2Checkpoint } from '../lib/builder/agent-v2.ts'

const files = ['package.json','src/catalog.js','src/orders.js','test/catalog.test.js','test/orders.test.js']
const changed = { tool:'edit_file', ok:true, changed:true, output:{path:'src/orders.js'} } as BuilderV2Receipt
const fail = { tool:'run_tests', ok:false, changed:false, output:{requestedCommand:'npm test',exitCode:1,timedOut:false} } as BuilderV2Receipt
const run = (command:string) => ({ tool:'run_tests',ok:true,changed:false,
  output:{requestedCommand:command,exitCode:0,timedOut:false,stdout:'# pass 4\n# fail 0'} }) as BuilderV2Receipt
const receipts = [fail,changed,run('npm test'),run('node --test test/*.test.js')]
const checkpoint = (n:number, r:number, verified:number):BuilderV2Checkpoint => ({
  version:2,workspaceId:'w',objectiveDigest:'objective',workspaceDigest:'digest',
  steps:receipts.slice(0,n),revision:r,verifiedRevision:verified,unproductive:0,lastReceipt:'',
})
const valid = () => ({ workspaceFiles:files, receipts,checkpointBefore:checkpoint(1,0,-1),
  checkpointAfter:checkpoint(4,1,1),publication:{pullRequestUrl:'https://github.com/example/project/pull/123',verifiedRevision:1} })

test('level 4 objective requires five files, two commands and at least four tests',()=>{
  const contract=builderTaskContract(BUILDER_LEVEL4_OBJECTIVE)
  assert.deepEqual(contract.files,files)
  assert.deepEqual(contract.commands,['npm test','node --test test/*.test.js'])
  assert.ok(contract.minimumTests>=4)
})

test('all host evidence components are required',()=>{
  assert.equal(evaluateBuilderLevel4(valid()).passed,true)
})

test('passing commands without failure-repair evidence cannot certify',()=>{
  const data=valid()
  const outcome=evaluateBuilderLevel4({...data,receipts:[changed,run('npm test'),run('node --test test/*.test.js')]})
  assert.ok(outcome.reasons.includes('failure_repair_not_observed'))
})

test('missing second command or fewer tests blocks certification',()=>{
  const data=valid()
  const outcome=evaluateBuilderLevel4({...data,receipts:[fail,changed,run('npm test')]})
  assert.ok(outcome.reasons.includes('multi_file_acceptance_unverified'))
})

test('stale or unverified publication cannot certify',()=>{
  const data=valid()
  const outcome=evaluateBuilderLevel4({...data,publication:{pullRequestUrl:'https://github.com/example/project/pull/123',verifiedRevision:0}})
  assert.ok(outcome.reasons.includes('verified_pull_request_unavailable'))
})

test('missing checkpoint continuation cannot certify',()=>{
  const data=valid()
  const outcome=evaluateBuilderLevel4({...data,checkpointBefore:undefined})
  assert.ok(outcome.reasons.includes('checkpoint_continuation_unverified'))
})


test('owner Level 4 endpoint dispatches a real V2 job without granting certification',()=>{
  const source = readFileSync(new URL('../app/api/admin/builder-certification/route.ts',import.meta.url),'utf8')
  assert.match(source,/await requireOwner\(\)/)
  assert.match(source,/LEVEL4_CASE_ID = 'builder_v2_end_to_end_reliability_v1'/)
  assert.match(source,/level4Probe: true, builderEngine: 'v2'/)
  assert.match(source,/await enqueueBuilderJob\(\{/)
  assert.match(source,/await runBuilderJob\(jobId, userId\)/)
  assert.match(source,/certification: 'pending_independent_evidence'/)
})
