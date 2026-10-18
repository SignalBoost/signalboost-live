import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileMergedRepositoryRepairs } from '../lib/builder/repository-repair-reconciliation.ts'
const head = 'a'.repeat(40), merge = 'b'.repeat(40)
const pending = {pullRequestNumber:4701,baseBranch:'test/canary',repairCommitSha:head,preMergeSnapshotId:null}
const pull = () => ({number:4701,state:'closed',merged:true,merge_commit_sha:merge,
  base:{ref:'test/canary',repo:{full_name:'SignalBoost/signalboost-live'}},
  head:{sha:head,repo:{full_name:'SignalBoost/signalboost-live'}}})

test('externally merged repair is reconciled by saved identity without open-list or mutable PR body', async () => {
  const calls: unknown[] = []
  const result=await reconcileMergedRepositoryRepairs({pending:[pending],token:'test',
    request:async (url,init)=>{assert.match(String(url),/\/pulls\/4701$/);assert.equal(init?.method,undefined);return Response.json({...pull(),body:'edited by owner'})},
    complete:async evidence=>{calls.push(evidence);return true}})
  assert.equal(result.completed,1)
  assert.deepEqual(calls,[{pullRequestNumber:4701,baseBranch:'test/canary',mergeCommitSha:merge,preMergeSnapshotId:null,mergeEvidence:'observed_github'}])
})
test('open, unmerged, mismatched, fork and malformed PR evidence cannot complete a job', async () => {
  for(const mutate of [(p: ReturnType<typeof pull>)=>p.merged=false,(p: ReturnType<typeof pull>)=>p.state='open',(p: ReturnType<typeof pull>)=>p.number=2,(p: ReturnType<typeof pull>)=>p.head.sha='c'.repeat(40),(p: ReturnType<typeof pull>)=>p.base.ref='main',(p: ReturnType<typeof pull>)=>p.base.repo.full_name='other/repo',(p: ReturnType<typeof pull>)=>p.head.repo.full_name='other/repo',(p: ReturnType<typeof pull>)=>p.merge_commit_sha='bad']) {
    const p=pull();mutate(p)
    const result=await reconcileMergedRepositoryRepairs({pending:[pending],token:'test',request:async()=>Response.json(p),complete:async()=>{assert.fail('must not complete')}})
    assert.equal(result.completed,0)
  }
})
test('main repair without checkpoint stays pending; checkpoint is forwarded without inventing acceptance', async () => {
  const p=pull();p.base.ref='main';const seen:unknown[]=[]
  const complete=async (e: unknown)=>{seen.push(e);return false}
  await reconcileMergedRepositoryRepairs({pending:[{...pending,baseBranch:'main'}],token:'test',request:async()=>Response.json(p),complete})
  assert.equal(seen.length,0)
  const result=await reconcileMergedRepositoryRepairs({pending:[{...pending,baseBranch:'main',preMergeSnapshotId:'dpl_before'}],token:'test',request:async()=>Response.json(p),complete})
  assert.equal(result.completed,0);assert.equal(seen.length,1);assert.equal((seen[0] as any).preMergeSnapshotId,'dpl_before')
})
test('API failure leaves pending and later retry can complete; already-completed callback is idempotent', async () => {
  const run=(request:typeof fetch,complete:()=>Promise<boolean>)=>reconcileMergedRepositoryRepairs({pending:[pending],token:'test',request,complete})
  assert.equal((await run(async()=>new Response('',{status:503}),async()=>{assert.fail()})).errors,1)
  assert.equal((await run(async()=>Response.json(pull()),async()=>true)).completed,1)
  assert.equal((await run(async()=>Response.json(pull()),async()=>false)).completed,0)
})
test('scan respects deadline and bounded batch; absent token performs no I/O', async () => {
  let requests=0
  const input={pending:Array(10).fill(pending),token:'test',request:async()=>{requests++;return Response.json(pull())},complete:async()=>true}
  assert.equal((await reconcileMergedRepositoryRepairs({...input,deadlineAtMs:0})).inspected,0)
  assert.equal((await reconcileMergedRepositoryRepairs({...input,token:''})).inspected,0)
  assert.equal((await reconcileMergedRepositoryRepairs(input)).inspected,4);assert.equal(requests,4)
})
