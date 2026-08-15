import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeIncidentToNormalized } from '../self-healing-host/native-autonomous-loop'
import { classifyAction } from '../lib/infra-pr/action-policy'

/**
 * Non-destructive acceptance trace for the native Self-Healing boundary.
 * It proves a synthetic anomaly can be normalized for COS while governance
 * still distinguishes routine/internal work from consequential mutation.
 * No provider call or production mutation occurs in this test.
 */
test('synthetic native anomaly reaches COS input without gaining mutation authority', () => {
  const incident: any = {
    incidentId: 'acceptance-native-api-latency',
    provider: 'signalboost-platform',
    environment: 'production',
    severity: 'warning',
    detectedAt: '2026-08-13T19:30:00.000Z',
    source: 'acceptance-test',
    errorCode: 'native_api_latency',
    errorMessage: 'Synthetic acceptance anomaly: API p95 exceeded the warning threshold.',
    affectedResource: 'https://saas.signalboostapp.com/api/supervisor/native-health',
    evidence: [{
      evidenceId: 'acceptance-evidence-1',
      type: 'native_api_latency_probe',
      capturedAt: '2026-08-13T19:30:00.000Z',
      summary: 'Synthetic, non-destructive latency evidence for acceptance testing.',
    }],
    metadata: {
      monitoringMode: 'native',
      nativeProbe: 'api',
      observationOnly: true,
      syntheticAcceptance: true,
    },
  }

  const normalized = nativeIncidentToNormalized(incident, [
    { capabilityId: 'metrics.query', ok: true, synthetic: true },
  ])

  assert.equal(normalized.incident_id, incident.incidentId)
  assert.equal(normalized.trigger, 'NATIVE_HEALTH')
  assert.equal(normalized.context.native_probe, 'api')
  assert.match(normalized.raw_logs, /syntheticAcceptance/)

  const routine = classifyAction({ actionId: 'list_deployments', role: 'ai_operator' })
  assert.equal(routine.risk, 'low')
  assert.equal(routine.tier, 'auto_confirm')

  const consequential = classifyAction({ actionId: 'delete_deployment', role: 'ai_operator' })
  assert.equal(consequential.risk, 'high')
  assert.equal(consequential.tier, 'needs_approval')
})
