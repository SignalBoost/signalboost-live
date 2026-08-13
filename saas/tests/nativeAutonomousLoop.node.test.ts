import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeIncidentToNormalized } from '../self-healing-host/native-autonomous-loop'

const incident: any = {
  incidentId: 'native-api-1', provider: 'signalboost-platform', environment: 'production', severity: 'warning',
  detectedAt: '2026-08-13T05:00:00.000Z', source: 'cron', errorCode: 'native_api_latency', errorMessage: 'API p95 latency is 1800 ms.',
  affectedResource: 'https://saas.signalboostapp.com/api/supervisor/native-health',
  evidence: [{ evidenceId:'e1', type:'native_api_latency_probe', capturedAt:'2026-08-13T05:00:00.000Z', summary:'Measured live requests.' }],
  metadata: { monitoringMode:'native', nativeProbe:'api', observationOnly:true },
}

test('native incident becomes a generic COS diagnostic incident with connector evidence', () => {
  const normalized = nativeIncidentToNormalized(incident, [{ capabilityId:'metrics.query', ok:true }])
  assert.equal(normalized.incident_id, incident.incidentId)
  assert.equal(normalized.provider, 'signalboost-platform')
  assert.equal(normalized.trigger, 'NATIVE_HEALTH')
  assert.equal(normalized.context.native_probe, 'api')
  assert.match(normalized.raw_logs, /metrics\.query/)
})
