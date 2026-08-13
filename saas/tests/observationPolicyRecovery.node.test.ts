import test from 'node:test'
import assert from 'node:assert/strict'
import { SUPERVISOR_THINKER_SYSTEM_PROMPT } from '../lib/cos/supervisor-thinker-prompt.ts'
import { selfHealingHostCadence } from '../self-healing-host/host-scheduler.ts'
import { buildObservationSchedulePolicyDriftIncident } from '../self-healing-host/configuration-drift-monitoring.ts'
import { createNativeRepairActionResolver } from '../self-healing-host/native-repair-action-resolver.ts'
import { SELF_HEALING_GATEWAY_POLICY } from '../self-healing-host/self-healing-gateway-policy.ts'
import { GATEWAY_ALLOWLIST } from '../agent-gateway-host/gateway-policy.ts'
import { OBSERVATION_POLICY_RECONCILE_TARGET, createObservationPolicyRecoveryExecutor } from '../agent-gateway-host/observation-policy-recovery.ts'

const drift = buildObservationSchedulePolicyDriftIncident({
  detectedAt: '2026-08-13T21:40:00.000Z', fingerprint: 'abcdef0123456789abcdef0123456789',
  policyIntervalSeconds: 900, scheduledIntervalSeconds: 7200, schedulerSchedule: '2 */2 * * *',
  nativeMonitoringIntervalSeconds: 1800, nativeMonitoringSchedule: '5,35 * * * *', policyUpdatedBy: 'system',
})

test('host cadence is derived from the deployed vercel.json rather than model input', () => {
  const cadence = selfHealingHostCadence()
  assert.equal(cadence.vercelObservation?.maximumIntervalSeconds, 7200)
  assert.equal(cadence.nativeProactiveMonitoring?.maximumIntervalSeconds, 1800)
})

test('configuration drift is a first-class incident with one exact registered recovery', () => {
  assert.equal(drift.errorCode, 'supervisor_observation_schedule_policy_drift')
  assert.equal(drift.metadata.recoveryPreauthorized, true)
  assert.equal(drift.metadata.registeredRecoveryAction, OBSERVATION_POLICY_RECONCILE_TARGET)
  assert.equal(drift.metadata.policyIntervalSeconds, 900)
  assert.equal(drift.metadata.scheduledIntervalSeconds, 7200)
})

test('only trusted host-created drift can resolve to the recovery target', () => {
  const resolver = createNativeRepairActionResolver(drift)
  const step: any = { step: 1, action: 'reconcile observation policy cadence', executor: 'api_executor', target: 'observation policy', expected_result: 'policy matches scheduler', requires_approval: false }
  assert.equal(resolver(step, { incident_id: drift.incidentId, project: 'signalboost-live' }), OBSERVATION_POLICY_RECONCILE_TARGET)
  const untrusted = createNativeRepairActionResolver({ ...drift, metadata: { ...drift.metadata, recoveryPreauthorized: false } })
  assert.notEqual(untrusted(step, { incident_id: drift.incidentId, project: 'signalboost-live' }), OBSERVATION_POLICY_RECONCILE_TARGET)
})

test('the extra recovery is scoped to Self-Healing rather than the global Gateway', () => {
  assert.equal(GATEWAY_ALLOWLIST.some(entry => entry.target === OBSERVATION_POLICY_RECONCILE_TARGET), false)
  assert.equal(SELF_HEALING_GATEWAY_POLICY.allowlist.some(entry => entry.target === OBSERVATION_POLICY_RECONCILE_TARGET), true)
  const request: any = { requestId: 'drift:test', protocol: 'supervisor', agentId: 'cos', action: { kind: 'supervisor_repair', target: OBSERVATION_POLICY_RECONCILE_TARGET } }
  assert.equal(SELF_HEALING_GATEWAY_POLICY.classifier.classify(request), 'reversible_internal')
})

test('recovery executor stays on the exact target and reports its verifier result', async () => {
  let calls = 0
  const executor = createObservationPolicyRecoveryExecutor({ reconcile: async () => { calls += 1; return { changed: true, policyInstanceId: 'vercel-observation-cron', previousIntervalSeconds: 900, currentIntervalSeconds: 7200, schedulerSchedule: '2 */2 * * *', nativeMonitoringIntervalSeconds: 1800, verified: true } } })
  const ignored = await executor.attempt({ requestId: 'x', protocol: 'supervisor', agentId: 'cos', action: { kind: 'supervisor_repair', target: 'other' } } as any)
  assert.equal(ignored.handled, false); assert.equal(calls, 0)
  const handled = await executor.attempt({ requestId: 'y', protocol: 'supervisor', agentId: 'cos', action: { kind: 'supervisor_repair', target: OBSERVATION_POLICY_RECONCILE_TARGET } } as any)
  assert.equal(handled.handled, true); assert.equal(handled.ok, true); assert.equal(calls, 1)
})

test('COS prompt recognizes explicit host pre-authorization but never lets COS invent it', () => {
  assert.match(SUPERVISOR_THINKER_SYSTEM_PROMPT, /registeredRecoveryAction/)
  assert.match(SUPERVISOR_THINKER_SYSTEM_PROMPT, /Never infer pre-authorization/)
  assert.match(SUPERVISOR_THINKER_SYSTEM_PROMPT, /Gateway independently classifies and authorizes every action/)
})
