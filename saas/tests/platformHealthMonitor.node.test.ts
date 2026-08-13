import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPlatformHealthSnapshot } from '../lib/supervisor/platform-health.ts'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'
import {
  ApiHealthObserver,
  CertificateExpiryObserver,
  DatabaseHealthObserver,
  StorageHealthObserver,
  percentile95,
  type NativeProbeSample,
  type NativeProbeStore,
} from '../self-healing-host/native-proactive-monitoring.ts'

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

class MemoryProbeStore implements NativeProbeStore {
  readonly samples: NativeProbeSample[] = []
  private readonly existing: NativeProbeSample[]
  constructor(existing: NativeProbeSample[] = []) { this.existing = existing }
  async history(probeId: NativeProbeSample['probeId'], target: string): Promise<NativeProbeSample[]> {
    return [...this.existing, ...this.samples].filter(sample => sample.probeId === probeId && sample.target === target).reverse()
  }
  async save(sample: NativeProbeSample): Promise<void> { this.samples.push(sample) }
}

const probeContext = { provider: 'signalboost-platform', environment: 'production' as const }

test('native API probe calculates upper-tail latency', () => {
  assert.equal(percentile95([10, 20, 30, 40, 50]), 50)
})

test('native API probe emits a 5xx incident and persists the measured rate', async () => {
  const store = new MemoryProbeStore()
  const statuses = [200, 200, 500, 503, 200]
  let index = 0
  const observer = new ApiHealthObserver({
    urls: ['https://saas.signalboostapp.com/api/supervisor/native-health'],
    store,
    samplesPerUrl: 5,
    latencyMs: { warning: 100000, critical: 200000 },
    fetchImpl: async () => new Response('{}', { status: statuses[index++] }),
  })
  const incidents = await observer.observe(probeContext)
  assert.equal(store.samples.length, 1)
  assert.equal(store.samples[0].errorRate, 0.4)
  assert.equal(incidents.some(incident => incident.errorCode === 'native_api_error_rate'), true)
})

test('native API probe detects a latency regression against durable history', async () => {
  const target = 'https://saas.signalboostapp.com/api/supervisor/native-health'
  const prior = [100, 110, 105].map((latencyMs, index): NativeProbeSample => ({
    probeId: 'api',
    target,
    observedAt: new Date(Date.now() - (index + 1) * 900000).toISOString(),
    status: 'healthy',
    latencyMs,
    errorRate: 0,
    details: {},
  }))
  const store = new MemoryProbeStore(prior)
  const observer = new ApiHealthObserver({
    urls: [target],
    store,
    samplesPerUrl: 1,
    latencyMs: { warning: 100000, critical: 200000 },
    trendMultiplier: 1.1,
    fetchImpl: async () => {
      await new Promise(resolve => setTimeout(resolve, 130))
      return new Response('{}', { status: 200 })
    },
  })
  const incidents = await observer.observe(probeContext)
  assert.equal(incidents.some(incident => incident.errorCode === 'native_api_latency_regression'), true)
})

test('native database probe reports connection pressure aggregates', async () => {
  const store = new MemoryProbeStore()
  const observer = new DatabaseHealthObserver({
    store,
    db: { rpc: async () => ({ data: {
      active_connections: 92,
      max_connections: 100,
      connection_pressure_pct: 92,
      active_queries: 8,
      longest_query_seconds: 11,
    }, error: null }) },
    latencyMs: { warning: 100000, critical: 200000 },
  })
  const incidents = await observer.observe(probeContext)
  assert.equal(store.samples[0].metricValue, 92)
  assert.equal(incidents.some(incident => incident.errorCode === 'native_database_connection_pressure'), true)
})

test('native storage probe reports capacity pressure from Storage catalog aggregates', async () => {
  const store = new MemoryProbeStore()
  const observer = new StorageHealthObserver({
    store,
    db: {
      storage: { listBuckets: async () => ({ data: [{ id: 'a' }], error: null }) },
      rpc: async () => ({ data: { bytes_used: 950, object_count: 10, bucket_count: 1, capacity_pct: 95 }, error: null }),
    },
    quotaBytes: 1000,
    latencyMs: { warning: 100000, critical: 200000 },
  })
  const incidents = await observer.observe(probeContext)
  assert.equal(store.samples[0].metricValue, 95)
  assert.equal(incidents.some(incident => incident.errorCode === 'native_storage_capacity_pressure'), true)
})

test('native certificate probe raises expiry alerts from certificate inspection', async () => {
  const store = new MemoryProbeStore()
  const observed = new Date('2026-08-12T12:00:00.000Z')
  const observer = new CertificateExpiryObserver({
    store,
    targets: [{ host: 'saas.signalboostapp.com', port: 443 }],
    now: () => observed,
    inspectCertificate: async () => ({
      validTo: new Date(observed.getTime() + 5 * 86400000).toISOString(),
      subject: 'saas.signalboostapp.com',
      issuer: 'test-ca',
    }),
  })
  const incidents = await observer.observe(probeContext)
  assert.equal(store.samples[0].metricUnit, 'days_remaining')
  assert.equal(incidents.some(incident => incident.errorCode === 'native_certificate_expiry'), true)
})
