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
