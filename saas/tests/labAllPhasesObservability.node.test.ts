import test from 'node:test'
import assert from 'node:assert/strict'
import { LAB_PHASE_SIGNALS, type LabPhaseSignal, makeLabPhaseObservation, assessLabPhaseHealth, emitLabPhaseObservation } from '../lib/ai/cos/labAllPhasesObservability.ts'
const sha='abcdef1234567890', time='2026-10-08T20:00:00.000Z', now=Date.parse(time)+1000
const observation=(phase:1|2|3|4|5,signal:LabPhaseSignal,source:'synthetic_ci'|'live_runtime'|'independent_review'='live_runtime') => makeLabPhaseObservation({phase,signal,source,outcome:'passed',exactRevision:sha,observedAt:time})
test('all five phases have distinct required signals and unknown baseline',()=>{
 const health=assessLabPhaseHealth([],sha,now)
 assert.equal(health.phases.length,5)
 assert.equal(health.allObserved,false)
 assert.equal(health.allCertified,false)
 assert.deepEqual(health.phases.map(p=>p.status),Array(5).fill('unknown'))
})
test('synthetic checks cannot prove actual observation or certification',()=>{
 const event=observation(1,'factory_execution','synthetic_ci')
 const health=assessLabPhaseHealth([event],sha,now)
 assert.equal(health.phases[0].status,'unknown')
 assert.equal(event.productionAuthorized,false)
})
test('independent proof still never self-certifies; exact revision isolated',()=>{
 const events=(Object.keys(LAB_PHASE_SIGNALS) as unknown as ('1'|'2'|'3'|'4'|'5')[]).flatMap(k=>LAB_PHASE_SIGNALS[Number(k) as 1|2|3|4|5].map(signal=>makeLabPhaseObservation({phase:Number(k) as 1|2|3|4|5,signal,source:'independent_review',outcome:'passed',exactRevision:sha,observedAt:time})))
 assert.equal(assessLabPhaseHealth(events,sha,now).allObserved,true)
 assert.equal(assessLabPhaseHealth(events,sha,now).allCertified,false)
 assert.equal(assessLabPhaseHealth(events,'ddddddd',now).allObserved,false)
 assert.equal(assessLabPhaseHealth(events,sha,now+90000000).phases[0].status,'stale')
})
test('failed live observations block phase and invalid contracts are rejected',()=>{
 const denied=makeLabPhaseObservation({phase:4,signal:'refund_integrity',source:'live_runtime',outcome:'blocked',exactRevision:sha,observedAt:time})
 assert.equal(assessLabPhaseHealth([denied],sha,now).phases[3].status,'blocked')
 assert.throws(()=>makeLabPhaseObservation({...denied,phase:1}),/mismatch/)
 assert.throws(()=>makeLabPhaseObservation({...denied,exactRevision:'latest'}),/revision/)
})
test('telemetry sink failure propagates and private metadata surface stays constrained',async()=>{
 const event=observation(5,'partner_pilot')
 assert.deepEqual(Object.keys(event).sort(),['schema','phase','signal','source','outcome','exactRevision','observedAt','independentlyCertified','productionAuthorized'].sort())
 await assert.rejects(emitLabPhaseObservation(event,async()=>{throw Error('sink_offline')}),/sink_offline/)
})
