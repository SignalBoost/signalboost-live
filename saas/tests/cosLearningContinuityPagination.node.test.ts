// saas/tests/cosLearningContinuityPagination.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { assessLearningContinuity } from '../lib/ai/cos/learningContinuity.ts'
import {
  CONTINUITY_CORPUS_PAGE_SIZE,
  readLearningContinuityCorpus,
  type ContinuityCorpusRead,
} from '../lib/ai/cos/learningContinuityPagination.ts'

type Row={created_at:string;subject:string;source_kind:string}

function fakeDb(rows:Row[],serverCap=1000){
  const ranges:Array<[number,number]>=[]
  return {
    ranges,
    from(table:string){
      assert.equal(table,'cos_continuous_learning')
      const query:any={
        select(){return query},
        or(){return query},
        order(){return query},
        async range(from:number,to:number){
          ranges.push([from,to])
          const requested=rows.slice(from,to+1)
          return {data:requested.slice(0,serverCap),error:null}
        },
      }
      return query
    },
  }
}

function mustRows(result:ContinuityCorpusRead):Row[]{
  assert.equal(result.ok,true)
  if('error' in result)throw new Error(result.error)
  return result.rows as Row[]
}

test('continuity reader paginates through a server-side 1000-row cap instead of truncating history', async()=>{
  assert.equal(CONTINUITY_CORPUS_PAGE_SIZE,1000)
  const now=new Date('2026-09-25T08:00:00.000Z')
  const rows:Row[]=[]
  // 7 fully active days, 450 retained rows/day = 3,150 rows. A single newest-1000 sample would
  // include only a little over two days and fabricate four or five silent days.
  for(let day=0;day<7;day+=1){
    for(let i=0;i<450;i+=1){
      rows.push({
        created_at:new Date(now.getTime()-day*86_400_000-i*30_000).toISOString(),
        subject:`subject-${day}-${i%5}`,
        source_kind:'library_material',
      })
    }
  }
  rows.sort((a,b)=>b.created_at.localeCompare(a.created_at))

  const db=fakeDb(rows,1000)
  const corpus=mustRows(await readLearningContinuityCorpus(db as any,'fact_extraction_error.is.null'))
  assert.equal(corpus.length,3150)
  assert.deepEqual(db.ranges,[[0,999],[1000,1999],[2000,2999],[3000,3999]])

  const report=assessLearningContinuity(corpus,[],{now,cycleIntervalHours:24})
  assert.equal(report.silentDaysLast7,0)
  assert.equal(report.status,'green')
  assert.equal(report.corpusDocuments,3150)
  assert.equal(report.documentsLast7Days,3150)
})

test('continuity reader does not mistake a short final page for a full-page server cap', async()=>{
  const rows:Row[]=Array.from({length:1501},(_,i)=>({
    created_at:new Date(Date.UTC(2026,8,25,8,0,0)-i*60_000).toISOString(),
    subject:'computer science',
    source_kind:'library_material',
  }))
  const db=fakeDb(rows,1000)
  const corpus=mustRows(await readLearningContinuityCorpus(db as any,'fact_extraction_error.is.null'))
  assert.equal(corpus.length,1501)
  assert.deepEqual(db.ranges,[[0,999],[1000,1999]])
})
