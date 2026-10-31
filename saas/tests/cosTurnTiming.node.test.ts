import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatTurnStages } from '../lib/ai/cos/chatInferenceTrail.ts'

test('turn timing formats longest stages and is exposed in live provenance',()=>{
 const line=formatTurnStages([{at:'2026-09-30T03:52:40Z',stage:'enterprise:retrieval_total',latencyMs:1320},{at:'2026-09-30T03:52:50Z',stage:'enterprise:reasoner',latencyMs:10900},{at:'2026-09-30T03:52:50Z',stage:'primary:cos_first_answer',latencyMs:12600}])
 assert.equal(line,'primary:cos_first_answer 12.6 s · enterprise:reasoner 10.9 s · enterprise:retrieval_total 1.3 s')
 assert.equal(formatTurnStages(null),'unavailable')
 const live=readFileSync(new URL('../lib/ai/cos/cosOrchestrationLive.ts',import.meta.url),'utf8')
 assert.match(live,/Turn Timing/)
})
test('first answer records retrieval and reasoner timing',()=>{
 const source=readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts',import.meta.url),'utf8')
 assert.match(source,/recordCosLatencyStage\('enterprise:retrieval_total'/)
 assert.match(source,/recordCosLatencyStage\('enterprise:reasoner'/)
 const state=readFileSync(new URL('../lib/ai/cos/cosLiveSystemState.ts',import.meta.url),'utf8')
 assert.match(state,/\.eq\('task_id','cos-latency-stage'\)/)
})

test('Q13: non-model stages log start/end with the same trace id as provider usage, without breaking stored stage rows',()=>{
 const stages=readFileSync(new URL('../lib/ai/cos/cosLatencyStages.ts',import.meta.url),'utf8')
 const browser=readFileSync(new URL('../app/api/cos-browser/route.ts',import.meta.url),'utf8')
 assert.match(stages,/currentTraceId\(\)/)
 assert.match(stages,/\[cos-latency-stage-trace\]/)
 assert.match(stages,/startAt: new Date\(startedAt\)\.toISOString\(\)/)
 assert.match(stages,/task_id: COS_LATENCY_STAGE_TASK_ID/)
 assert.match(browser,/timeCosStage\('browser:request_decode'/)
 assert.match(browser,/timeCosStage\('browser:authorization'/)
 assert.match(browser,/timeCosStage\('browser:semantic_identity'/)
})

test('Q13: reasoner phase timing preserves actual execution bounds before deferred flush',async()=>{
 const { TurnRecorder } = await import('../lib/ai/cos/turnExperience.ts')
 let now=1000
 const recorder=new TurnRecorder(()=>now)
 const alpha=await recorder.time('alpha',async()=>{now=1035;return 'ok'})
 assert.equal(alpha,'ok')
 now=1100
 await recorder.time('beta',async()=>{now=1125;return 'done'})
 const phases=recorder.snapshot({turnId:'trace',promptHash:'hash',features:{wordCount:0,avgWordLength:0,isLookup:false,hasComparison:false,hasMultiHop:false,hasCode:false,hasMath:false},reasonerLabel:'test',answered:true}).phases
 assert.deepEqual(phases.map(p=>({start:p.startedAt,end:p.endedAt,ms:p.ms})),[
  {start:1000,end:1035,ms:35},
  {start:1100,end:1125,ms:25},
 ])
 const reasoner=readFileSync(new URL('../lib/ai/cos/cosReasoner.ts',import.meta.url),'utf8')
 assert.match(reasoner,/recordCosLatencyStage\(`reasoner:\$\{phase\.phase\}`, phase\.ms, \{ startedAt: phase\.startedAt, endedAt: phase\.endedAt \}\)/)
})
