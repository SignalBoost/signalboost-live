import test from 'node:test'
import assert from 'node:assert/strict'
import { makeLabPhaseObservation } from '../lib/ai/cos/labAllPhasesObservability.ts'
import { dispatchLabHealthAlerts } from '../lib/ai/cos/labPhaseSupervisorBridge.ts'
const sha='abcdef1234567890',time='2026-10-08T20:00:00.000Z',now=Date.parse(time)+1000
test('no observations generate unknown alerts across all five phases, never grant authority',async()=>{
 const sent:any[]=[]
 const result=await dispatchLabHealthAlerts([],sha,now,e=>{sent.push(e)})
 assert.equal(sent.length,15)
 assert.deepEqual(new Set(sent.map(x=>x.phase)),new Set([1,2,3,4,5]))
 assert.equal(result.health.productionAuthorized,false)
 assert.equal(result.health.allCertified,false)
})
test('synthetic checks do not suppress missing-live alerts',async()=>{
 const event=makeLabPhaseObservation({phase:1,signal:'factory_execution',source:'synthetic_ci',outcome:'passed',exactRevision:sha,observedAt:time})
 const result=await dispatchLabHealthAlerts([event],sha,now,()=>{})
 assert.equal(result.alerts.length,15)
})
test('live blocked signal generates a high-severity alert without evidence contents',async()=>{
 const event=makeLabPhaseObservation({phase:4,signal:'refund_integrity',source:'live_runtime',outcome:'blocked',exactRevision:sha,observedAt:time})
 const result=await dispatchLabHealthAlerts([event],sha,now,()=>{})
 assert.ok(result.alerts.some(x=>x.phase===4&&x.signal==='refund_integrity'&&x.severity==='high'))
 assert.deepEqual(Object.keys(result.alerts[0]).sort(),['code','phase','signal','exactRevision','severity'].sort())
})
test('supervisor transport failure cannot be mistaken for delivered evidence',async()=>{
 await assert.rejects(dispatchLabHealthAlerts([],sha,now,async()=>{throw Error('supervisor_down')}),/supervisor_down/)
})
