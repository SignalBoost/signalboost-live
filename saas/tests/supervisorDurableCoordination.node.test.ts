import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { InMemoryCoordinationStore, ownershipIdentity, SupabaseCoordinationStore, createSupervisorCoordinationStore } from '../lib/supervisor/coordination/index.ts'

const at = new Date('2026-07-16T00:00:00.000Z')
const instance = (runtimeId='runtime-1') => ({ instanceId:'supervisor-a', runtimeId, region:'iad1', availabilityZone:'iad1-a', startedAt:at.toISOString(), heartbeatAt:at.toISOString(), softwareVersion:'test', schemaVersion:'supervisor-instance-v1', supportedProviderKinds:['vercel'], status:'healthy' as const })
const work = (id='work-1', provider='vercel', tenantId='tenant-a') => ({ workItemId:id, workItemType:'api_repair', incidentId:'inc-1', provider, tenantId, environment:'sandbox' as const, state:'queued' as const, priority:1, createdAt:at.toISOString(), availableAt:at.toISOString(), attempt:0, maxAttempts:3, policyVersion:'policy-v1', schemaVersion:'supervisor-work-v1' })

test('migration creates durable coordination tables, RLS, and atomic lease RPC', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260716_supervisor_federated_coordination.sql', import.meta.url),'utf8')
  for (const name of ['supervisor_instances','supervisor_work_items','supervisor_leases','supervisor_coordination_events']) assert.match(sql, new RegExp(`create table if not exists public\\.${name}`))
  assert.match(sql, /create or replace function public\.supervisor_acquire_lease/) 
  assert.match(sql, /for update/) 
  assert.match(sql, /fencing_generation=next_token/) 
  assert.match(sql, /enable row level security/) 
  assert.match(sql, /revoke all on function public\.supervisor_acquire_lease/) 
})

test('in-memory implementation remains deterministic for unit tests and proves stale fencing rejection', async () => {
  const store = new InMemoryCoordinationStore({ now: () => at })
  await store.registerInstance(instance())
  await store.enqueueWorkItem(work())
  const lease = await store.acquireLease({ workItemId:'work-1', ownerInstanceId:'supervisor-a', ownerRuntimeId:'runtime-1', leaseDurationMs:1000, now:at })
  await store.assertFence('work-1', ownershipIdentity(lease), at)
  await assert.rejects(() => store.assertFence('work-1', { ...ownershipIdentity(lease), fencingToken:99 }, at), /stale or expired/)
})

test('provider and tenant boundaries are enforced in available-work queries', async () => {
  const store = new InMemoryCoordinationStore({ now: () => at })
  await store.enqueueWorkItem(work('a','vercel','tenant-a'))
  await store.enqueueWorkItem(work('b','stripe','tenant-a'))
  await store.enqueueWorkItem(work('c','vercel','tenant-b'))
  assert.deepEqual((await store.listAvailableWork({ provider:'vercel', tenantId:'tenant-a', limit:10, now:at })).map(w => w.workItemId), ['a'])
})

test('production durable store creation fails closed without Supabase and test mode may use memory', () => {
  assert.throws(() => createSupervisorCoordinationStore({ runtime:'production' }), /never falls back/)
  assert.ok(createSupervisorCoordinationStore({ runtime:'test' }) instanceof InMemoryCoordinationStore)
})

test('Supabase store uses RPC for atomic lease operations and sanitizes errors', async () => {
  const calls: string[] = []
  const fake = { rpc: async (name: string) => { calls.push(name); return { error:{ message:'token secret failed' } } }, from: () => ({ insert: async () => ({}) }) }
  const store = new SupabaseCoordinationStore(fake as any)
  await assert.rejects(() => store.acquireLease({ workItemId:'w', ownerInstanceId:'i', ownerRuntimeId:'r', leaseDurationMs:1000, now:at }), /\[redacted\]/)
  assert.deepEqual(calls, ['supervisor_acquire_lease'])
})

test('operator HA localization contains durable coordination labels in all required locales', () => {
  for (const lang of ['en','es','pt','pl','ru']) {
    const json = JSON.parse(readFileSync(new URL(`../locales/${lang}.json`, import.meta.url),'utf8'))
    for (const key of ['durableCoordination','coordinationStore','connected','supervisorInstance','runtimeId','lastHeartbeat','activeLease','leaseExpired','leaseOwner','fencingGeneration','workItem','queued','leased','processing','reassigned','abandoned','staleOwner','coordinationConflict','browserSessionLost','newExecutionRequired','providerWorker','reconciliation','noActiveLease','productionBrowserExecutionDisabled']) assert.equal(typeof json.supervisorHa[key], 'string', `${lang}.${key}`)
  }
})
