import test from 'node:test'
import assert from 'node:assert/strict'
import { createIncidentSource, createInMemoryDedupeStore, createInMemoryIncidentStore } from '../lib/supervisor/portable/incident-source.ts'
import { createMonitoringIncidentSourceDefinition, monitoringAdapterIds, stagedMonitoringAdapters } from '../lib/supervisor/portable/monitoring-adapters.ts'

const receivedAt='2026-07-27T12:00:00.000Z'
const fixtures:Record<(typeof monitoringAdapterIds)[number],unknown>={
 datadog:{id:'dd-1',title:'API unhealthy',message:'Five checks failed',alert_type:'error',host:'api.example.com',timestamp:receivedAt,aggregation_key:'api-health'},
 pagerduty:{event:{id:'pd-event',event_type:'incident.triggered',occurred_at:receivedAt,data:{id:'pd-1',title:'Checkout failure',urgency:'high',service:{id:'svc-1'},dedup_key:'checkout-failure'}}},
 'aws-cloudwatch-eventbridge':{id:'aws-1',time:receivedAt,detail:{alarmName:'High5xx',alarmArn:'arn:alarm:High5xx',state:{value:'ALARM',reason:'5xx threshold crossed'}}},
 'prometheus-alertmanager':{status:'firing',alerts:[{startsAt:receivedAt,fingerprint:'prom-1',labels:{alertname:'PodCrashLoop',severity:'critical',pod:'api-7d9'},annotations:{description:'Restart count exceeded threshold'}}]},
 splunk:{sid:'splunk-1',result:{_time:receivedAt,severity:'warning',host:'worker-1',message:'Job failures exceeded threshold'}},
 'azure-monitor':{data:{essentials:{alertId:'azure-1',alertRule:'AppUnavailable',severity:'Sev1',firedDateTime:receivedAt,description:'Availability test failed',alertTargetIDs:['/subscriptions/1/app']}}},
 'grafana-alerting':{status:'firing',alerts:[{startsAt:receivedAt,fingerprint:'grafana-1',labels:{alertname:'DatabaseLatency',severity:'warning',service:'postgres'},annotations:{description:'p95 latency is high'}}]},
 'google-cloud-operations':{incident:{incident_id:'gcp-1',started_at:receivedAt,severity:'critical',policy_name:'Cloud Run errors',summary:'Error rate exceeded threshold',resource:{display_name:'checkout-service',type:'cloud_run_revision'}}},
}

test('popular adapters remain staged and immutable',()=>{assert.deepEqual(stagedMonitoringAdapters.map(x=>x.adapterId),monitoringAdapterIds);assert.ok(stagedMonitoringAdapters.every(x=>x.maturity==='staged'));assert.ok(Object.isFrozen(stagedMonitoringAdapters))})
for(const adapterId of monitoringAdapterIds)test(`${adapterId} maps through universal intake`,async()=>{const source=createIncidentSource(createMonitoringIncidentSourceDefinition(adapterId,{sourceId:`source-${adapterId}`}),{dedupe:createInMemoryDedupeStore(),store:createInMemoryIncidentStore(),now:()=>new Date(receivedAt)});const result=await source.receive({headers:{},rawBody:JSON.stringify(fixtures[adapterId]),receivedAt});assert.equal(result.status,'accepted');if(result.status==='accepted'){assert.equal(result.incident.source,'webhook');assert.equal(result.incident.metadata.adapterId,adapterId)}})
test('vendor dedupe keys collapse repeated delivery',async()=>{const source=createIncidentSource(createMonitoringIncidentSourceDefinition('datadog',{sourceId:'datadog-main'}),{dedupe:createInMemoryDedupeStore(),store:createInMemoryIncidentStore(),now:()=>new Date(receivedAt)});const delivery={headers:{},rawBody:JSON.stringify(fixtures.datadog),receivedAt};assert.equal((await source.receive(delivery)).status,'accepted');assert.equal((await source.receive(delivery)).status,'duplicate')})
test('resolution notices are ignored',async()=>{const source=createIncidentSource(createMonitoringIncidentSourceDefinition('datadog',{sourceId:'datadog-main'}));assert.equal((await source.receive({headers:{},rawBody:JSON.stringify({status:'resolved',id:'dd-1'}),receivedAt})).status,'ignored')})
test('missing source identity fails closed',()=>assert.throws(()=>createMonitoringIncidentSourceDefinition('datadog',{sourceId:''}),/source_id_required/))
