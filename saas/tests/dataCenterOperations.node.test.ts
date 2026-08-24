import assert from 'node:assert/strict'
import test from 'node:test'
import { clusterDataCenterObservations } from '../lib/data-center/correlation.ts'
import {
  dataCenterObservationToSupervisorIncident,
  normalizeDataCenterObservation,
} from '../lib/data-center/observation.ts'
import { createDataCenterSimulation } from '../lib/data-center/simulator.ts'

test('data-center observation maps into the existing Supervisor incident contract as advisory-only evidence', () => {
  const observation = createDataCenterSimulation('pdu-overload')[0]
  const incident = dataCenterObservationToSupervisorIncident(observation)

  assert.equal(incident.environment, 'sandbox')
  assert.equal(incident.source, 'cron')
  assert.equal(incident.severity, 'warning')
  assert.equal(incident.metadata.domain, 'data_center_operations')
  assert.equal(incident.metadata.observationOnly, true)
  assert.equal(incident.metadata.advisoryOnly, true)
  assert.equal(incident.metadata.facilityControlAllowed, false)
  assert.equal(incident.metadata.assetClass, 'pdu')
  assert.match(String(incident.affectedResource), /sim-site-arizona-01/)
  assert.ok(incident.evidence.length >= 1)
})

test('data-center observation validation rejects secret-shaped metadata and non-finite telemetry', () => {
  const valid = createDataCenterSimulation('pdu-overload')[0]

  assert.throws(() => normalizeDataCenterObservation({
    ...valid,
    tags: { apiToken: 'should-never-enter-normalized-evidence' },
  }), /secret_shaped_key/)

  assert.throws(() => normalizeDataCenterObservation({
    ...valid,
    metric: { ...valid.metric, value: Number.NaN },
  }), /must_be_finite/)
})

test('cooling-loop simulator produces a correlated evidence cluster instead of three independent alarms', () => {
  const observations = createDataCenterSimulation('cooling-loop-degradation')
  const clusters = clusterDataCenterObservations(observations)

  assert.equal(observations.length, 3)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].observations.length, 3)
  assert.equal(clusters[0].siteId, 'sim-site-texas-01')
  assert.ok(clusters[0].observations.some(item => item.assetClass === 'cdu'))
  assert.ok(clusters[0].observations.filter(item => item.assetClass === 'environment_sensor').length >= 2)
  assert.ok(clusters[0].sharedCorrelationKeys.includes('cooling-loop-b'))
})

test('concurrent alerts are not merged merely because they occur at the same site and time', () => {
  const observations = createDataCenterSimulation('unrelated-concurrent-alerts')
  const clusters = clusterDataCenterObservations(observations)

  assert.equal(observations.length, 2)
  assert.equal(clusters.length, 2)
  assert.ok(clusters.every(cluster => cluster.observations.length === 1))
})

test('simulation fixtures are explicitly sandbox evidence and never imply facility-control authority', () => {
  for (const scenario of ['cooling-loop-degradation', 'pdu-overload', 'unrelated-concurrent-alerts'] as const) {
    for (const observation of createDataCenterSimulation(scenario)) {
      assert.equal(observation.environment, 'sandbox')
      assert.equal(observation.sourceKind, 'simulator')
      const incident = dataCenterObservationToSupervisorIncident(observation)
      assert.equal(incident.metadata.facilityControlAllowed, false)
      assert.equal(incident.metadata.advisoryOnly, true)
    }
  }
})
