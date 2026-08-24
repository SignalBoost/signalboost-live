import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { clusterDataCenterObservations } from '../lib/data-center/correlation.ts'
import { diagnoseDataCenterCluster } from '../lib/data-center/diagnostic.ts'
import {
  dataCenterObservationToSupervisorIncident,
  normalizeDataCenterObservation,
} from '../lib/data-center/observation.ts'
import { createDataCenterSimulation } from '../lib/data-center/simulator.ts'
import {
  dataCenterClusterToSupervisorIncident,
  dataCenterDiagnosticEvidenceBlock,
} from '../lib/data-center/supervisorBridge.ts'

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

test('correlated data-center evidence enters Supervisor with root cause explicitly unproven', () => {
  const cluster = clusterDataCenterObservations(createDataCenterSimulation('cooling-loop-degradation'))[0]
  const incident = dataCenterClusterToSupervisorIncident(cluster)
  const evidenceBlock = dataCenterDiagnosticEvidenceBlock(cluster)

  assert.equal(incident.metadata.domain, 'data_center_operations')
  assert.equal(incident.metadata.rootCauseStatus, 'unproven')
  assert.equal(incident.metadata.facilityControlAllowed, false)
  assert.equal(incident.metadata.observationCount, 3)
  assert.match(incident.errorMessage, /Root cause is not yet established/)
  assert.match(evidenceBlock, /correlation is not proof of physical root cause/i)
  assert.match(evidenceBlock, /Facility-control authority: NONE/i)
  assert.match(evidenceBlock, /cdu-2/i)
  assert.match(evidenceBlock, /rack-b17/i)
})

test('COS diagnostic contract separates observations hypotheses missing evidence and operator checks', async () => {
  const cluster = clusterDataCenterObservations(createDataCenterSimulation('cooling-loop-degradation'))[0]
  let capturedPrompt = ''
  const diagnostic = await diagnoseDataCenterCluster(cluster, {
    async generate(input) {
      capturedPrompt = input.prompt
      return JSON.stringify({
        summary: 'Cooling-loop B shows correlated pressure and inlet-temperature degradation that warrants operator review.',
        observedFacts: [
          'CDU-2 differential pressure is 31 psi versus a supplied 38 psi baseline.',
          'Rack B17 and B18 inlet temperatures are above supplied baselines.',
        ],
        hypotheses: [{
          label: 'Cooling-loop B flow degradation',
          confidence: 'moderate',
          rationale: 'The pressure decline and rising inlet temperatures share an explicit cooling-loop-B correlation key, but no pump state or flow measurement proves the cause.',
          supportingObservationIds: ['sim-cooling-cdu2-pressure', 'sim-cooling-rack-b17-temp', 'invented-id-must-be-dropped'],
        }],
        operatorChecks: [{
          priority: 1,
          action: 'Inspect CDU-2 pump/filter condition and compare approved local readings with the supplied pressure trend.',
          reason: 'This checks the leading hypothesis without changing any facility control state.',
        }],
        missingEvidence: ['Direct coolant flow measurement', 'CDU pump state/current', 'Approved maintenance history'],
      })
    },
  })

  assert.equal(diagnostic.controlAuthority, 'none')
  assert.equal(diagnostic.rootCauseStatus, 'unproven')
  assert.equal(diagnostic.hypotheses[0].confidence, 'moderate')
  assert.deepEqual(diagnostic.hypotheses[0].supportingObservationIds, ['sim-cooling-cdu2-pressure', 'sim-cooling-rack-b17-temp'])
  assert.match(capturedPrompt, /Use ONLY the supplied evidence/)
  assert.match(capturedPrompt, /Correlation does not establish root cause/)
  assert.match(capturedPrompt, /Do NOT recommend changing a setpoint/)
  assert.match(capturedPrompt, /Facility-control authority: NONE/)
})

test('COS diagnostic rejects incomplete model output instead of fabricating an advisory result', async () => {
  const cluster = clusterDataCenterObservations(createDataCenterSimulation('pdu-overload'))[0]
  await assert.rejects(
    diagnoseDataCenterCluster(cluster, { async generate() { return '{"summary":"Looks bad"}' } }),
    /data_center_diagnostic_incomplete/,
  )
})

test('owner-only simulation route keeps the first executable product surface sandboxed and non-controlling', () => {
  const route = readFileSync(new URL('../app/api/admin/data-center-operations/simulate/route.ts', import.meta.url), 'utf8')
  assert.match(route, /getAccess/)
  assert.match(route, /!access\?\.isOwner/)
  assert.match(route, /sandbox-simulation/)
  assert.match(route, /advisoryOnly:\s*true/)
  assert.match(route, /facilityControlAllowed:\s*false/)
  assert.match(route, /createLocalApplianceAiPort/)
  assert.doesNotMatch(route, /createExternalTeacherAiPort/)
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
