import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPlatformHealthSnapshot } from '../lib/supervisor/platform-health.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const now = new Date('2026-07-17T12:00:00.000Z')
const run = (overrides = {}) => ({ runId:'run-1', projectId:'p', providerConnectionId:'c', environment:'production', status:'healthy', startedAt:'2026-07-17T11:59:00.000Z', completedAt:'2026-07-17T12:00:00.000Z', completedStepIds:['verify-healthy-observation'], approvedStepIds:['verify-healthy-observation'], selectedChannel:'api', comparisonStatus:'unavailable', bpalSelections:[], auditEvents:[{eventId:'e',eventType:'workflow_completed',occurredAt:'2026-07-17T12:00:00.000Z',payload:{},schemaVersion:'x'}], evidence:[], verification:{status:'verified',checkedAt:'2026-07-17T12:00:00.000Z',summary:'ok',reasons:[]}, schemaVersion:'vercel-deployment-health-intelligence-v2', ...overrides }) as any

test('Mission 001 platform health monitor verifies a healthy platform snapshot', () => {
  const snapshot = createPlatformHealthSnapshot({ now, runs:[run()], instances:[{instance_id:'i1',runtime_id:'r1',status:'healthy',heartbeat_at:now.toISOString()}], workItems:[], leases:[], triggers:[{trigger_source:'schedule',status:'processed'}], ciState:'passing', localizationComplete:true })
  assert.equal(snapshot.status, 'healthy')
  assert.equal(snapshot.verification.status, 'verified')
  assert.ok(snapshot.score >= 90)
  for (const id of ['supervisor','lease','fencing','dispatcher','observer_latency','thinker_latency','verification_latency','audit_latency','persistence_latency','bpal_registry','provider_registration','scheduler','webhook_processing','queue_depth','active_work','stale_work','expired_leases','missed_heartbeats','reconciliation_backlog','verification_failures','audit_failures','localization_completeness','ci_validation']) assert.ok(snapshot.subsystems.some(s => s.id === id), id)
})

test('Mission 001 platform health monitor raises deterministic self-diagnostic alerts', () => {
  const snapshot = createPlatformHealthSnapshot({ now, runs:[run({ runId:'bad', status:'verification_failed', verification:{status:'failed',checkedAt:now.toISOString(),summary:'bad',reasons:['x']}, auditEvents:[] })], instances:[{instance_id:'i1',runtime_id:'r1',status:'healthy',heartbeat_at:'2026-07-17T11:00:00.000Z'}], workItems:Array.from({length:30},(_,i)=>({work_item_id:`w${i}`,state:'queued',created_at:'2026-07-17T10:00:00.000Z'})), leases:[{lease_id:'l1',expires_at:'2026-07-17T11:59:00.000Z',fencing_token:1}], triggers:[{trigger_source:'webhook',status:'failed'},{trigger_source:'schedule',status:'failed'}], ciState:'failing', localizationComplete:false })
  assert.equal(snapshot.status, 'critical')
  for (const type of ['stale_lease','missing_heartbeat','verification_failures','audit_persistence_failure','growing_queue','repeated_webhook_failures','repeated_scheduler_failures','localization_regression','ci_regression']) assert.ok(snapshot.alerts.some(a => a.type === type), type)
  assert.equal(snapshot.verification.status, 'verified')
})

test('Supervisor Operations Center exposes platform self-diagnostics without controls', () => {
  const page = hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/supervisor/page.tsx', import.meta.url), 'utf8'))
  assert.match(page, /createPlatformHealthSnapshot/)
  for (const label of ['systemDiagnostics','subsystemMeasurements','incidentQueue','activeWork','engineeringView','auditView']) assert.match(page, new RegExp(label))
  assert.doesNotMatch(page, /<form|<button|repair|redeploy|BrowserRuntime|Playwright/i)
})
