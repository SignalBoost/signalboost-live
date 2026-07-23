import test from 'node:test'
import assert from 'node:assert/strict'
import { createMissionWorkerRuntime, missionWorkerConfig, type MissionLease, type MissionRuntimePorts } from '../lib/supervisor/missions/runtime.ts'
const lease: MissionLease = { owner:'instance-a', fencingToken:1, expiresAt:'2026-07-23T00:01:00.000Z' }
const snapshot = async () => ({ pendingOutboxCount:0,claimedOutboxCount:0,retryWaitCount:0,deadLetterCount:0,queueDepth:0,activeJobs:0,delayedJobs:0,failedJobs:0,completedJobs:0,duplicateEvents:0,recoveredEvents:0 })
test('workers are disabled unless explicitly enabled and invalid leases fail closed', () => {
  assert.equal(missionWorkerConfig({}).enabled, false)
  assert.throws(() => missionWorkerConfig({ MISSION_WORKERS_ENABLED:'true', MISSION_REDIS_URL:'redis://secret', MISSION_WORKER_LEASE_MS:'1000', MISSION_WORKER_HEARTBEAT_MS:'1000' }))
})
test('runtime start and stop are idempotent and publish only with a current lease', async () => {
  let acquire=0,publish=0,release=0,startConsumer=0,stopConsumer=0
  const ports: MissionRuntimePorts={ acquireLease:async()=>{acquire++;return lease},renewLease:async value=>value,releaseLease:async()=>{release++},recover:async()=>0,publish:async()=>{publish++;return 1},startConsumer:async()=>{startConsumer++},stopConsumer:async()=>{stopConsumer++},snapshot }
  const runtime=createMissionWorkerRuntime({config:missionWorkerConfig({MISSION_WORKERS_ENABLED:'true',MISSION_OUTBOX_PUBLISHER_ENABLED:'true',MISSION_CONSUMER_ENABLED:'true',MISSION_REDIS_URL:'redis://not-logged'}),ports,instanceId:'instance-a'})
  await runtime.start(); await runtime.start(); await runtime.stop(); await runtime.stop()
  assert.deepEqual({acquire,publish,release,startConsumer,stopConsumer},{acquire:1,publish:1,release:1,startConsumer:1,stopConsumer:1})
})
test('no lease makes enabled publisher capacity critical and prevents publication', async () => {
  let publish=0; const runtime=createMissionWorkerRuntime({config:missionWorkerConfig({MISSION_WORKERS_ENABLED:'true',MISSION_OUTBOX_PUBLISHER_ENABLED:'true',MISSION_REDIS_URL:'redis://not-logged'}),instanceId:'x',ports:{acquireLease:async()=>undefined,renewLease:async()=>undefined,releaseLease:async()=>{},recover:async()=>0,publish:async()=>{publish++;return 0},snapshot}})
  await runtime.start(); assert.equal((await runtime.health()).status,'critical'); assert.equal(publish,0); await runtime.stop()
})
