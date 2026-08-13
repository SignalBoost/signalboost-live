import assert from 'node:assert/strict'
import test from 'node:test'
import { platformHealthNativeMonitoringCollector } from './platform-health-monitoring-adapter.ts'

test('platform health collector converts real platform alerts into supervisor incidents', async () => {
  const collector = platformHealthNativeMonitoringCollector(() => ({
    now: new Date('2026-08-12T18:00:00-06:00'),
    instances: [{ instanceId: 'sup-1', status: 'healthy', heartbeatAt: '2026-08-12T17:40:00-06:00' }],
    workItems: Array.from({ length: 30 }, (_, index) => ({ workItemId: `w-${index}`, state: 'queued', createdAt: '2026-08-12T17:59:00-06:00' })),
    leases: [],
    triggers: [],
    runs: [],
    ciState: 'passing',
    localizationComplete: true,
  }))

  const incidents = await collector.observer.observe({ provider: 'signalboost-platform', environment: 'production' })
  assert.ok(incidents.some(incident => incident.errorCode === 'growing_queue'))
  assert.ok(incidents.every(incident => incident.metadata.observationOnly === true))
})

test('healthy platform health produces no incident', async () => {
  const collector = platformHealthNativeMonitoringCollector(() => ({
    now: new Date('2026-08-12T18:00:00-06:00'),
    instances: [{ instanceId: 'sup-1', status: 'healthy', heartbeatAt: '2026-08-12T17:59:00-06:00' }],
    workItems: [], leases: [], triggers: [], runs: [], ciState: 'passing', localizationComplete: true,
  }))
  const incidents = await collector.observer.observe({ provider: 'signalboost-platform', environment: 'production' })
  assert.equal(incidents.length, 0)
})
