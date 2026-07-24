import assert from 'node:assert/strict';
import test from 'node:test';
import { EAE_RISK_ENGINE_SCHEMA_VERSION, assessEnterpriseRisk, type RiskSignal } from '../lib/autonomous-systems/index.ts';

const tenant = { tenantId: 'tenant-a', environmentId: 'prod' };
const signal = (overrides: Partial<RiskSignal> = {}): RiskSignal => ({ signalId: 'signal-1', tenant, subject: 'campaign-1', riskLevel: 'high', weight: 3, evidenceRefs: ['evidence-1'], ...overrides });

test('builds deterministic immutable tenant-scoped assessments', () => {
  const request = { tenant, signals: [signal()], maxSignals: 16 };
  const first = assessEnterpriseRisk(request);
  const second = assessEnterpriseRisk(request);
  assert.equal(first.schemaVersion, EAE_RISK_ENGINE_SCHEMA_VERSION);
  assert.equal(first.assessmentId, second.assessmentId);
  assert.equal(first.riskLevel, 'high');
  assert.ok(Object.isFrozen(first));
});

test('orders and bounds signals while preserving evidence', () => {
  const result = assessEnterpriseRisk({ tenant, signals: [signal({ signalId: 'low', riskLevel: 'low', weight: 100, evidenceRefs: ['low'] }), signal({ signalId: 'critical', riskLevel: 'critical', weight: 1, evidenceRefs: ['critical'] })], maxSignals: 1 });
  assert.deepEqual(result.signalIds, ['critical']);
  assert.deepEqual(result.evidenceRefs, ['critical']);
  assert.equal(result.truncated, true);
});

test('fails closed for cross-tenant, duplicate, and unbounded requests', () => {
  assert.throws(() => assessEnterpriseRisk({ tenant, signals: [signal({ tenant: { tenantId: 'other', environmentId: 'prod' } })], maxSignals: 1 }), /tenant_environment_boundary_violation/);
  assert.throws(() => assessEnterpriseRisk({ tenant, signals: [signal(), signal()], maxSignals: 2 }), /duplicate_risk_signal_id/);
  assert.throws(() => assessEnterpriseRisk({ tenant, signals: [], maxSignals: 0 }), /unbounded_risk_assessment_rejected/);
});
