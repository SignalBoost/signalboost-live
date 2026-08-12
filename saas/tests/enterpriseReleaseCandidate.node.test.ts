import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateLoadProfile,
  evaluateObservability,
  evaluateRecoveryEvidence,
  evaluateReleaseCandidateReadiness,
  evaluateSecurityEvidence,
  evaluateTenantIsolation,
} from '../lib/release-candidate/index.ts'

const evidence = [{ ref: 'vercel:prod-green', kind: 'deployment' as const, observedAt: '2026-08-10T03:10:00.000Z' }]

test('release candidate requires every required gate to pass', () => {
  const snapshot = evaluateReleaseCandidateReadiness({
    tenant: { tenantId: 'tenant-a', environmentId: 'prod' },
    generatedAt: '2026-08-10T03:11:00.000Z',
    checks: [
      { checkId: 'deployment', category: 'deployment', status: 'pass', required: true, summary: 'production deployment green', evidence },
      { checkId: 'security', category: 'security', status: 'pass', required: true, summary: 'security verification complete', evidence },
      { checkId: 'docs', category: 'documentation', status: 'warn', required: false, summary: 'minor docs follow-up', evidence },
    ],
  })
  assert.equal(snapshot.releaseCandidate, true)
  assert.equal(snapshot.requiredPassRate, 1)
  assert.deepEqual(snapshot.warningCheckIds, ['docs'])
})

test('a passing gate without recorded evidence is rejected', () => {
  assert.throws(() => evaluateReleaseCandidateReadiness({
    tenant: { tenantId: 'tenant-a', environmentId: 'prod' },
    generatedAt: '2026-08-10T03:11:00.000Z',
    checks: [{ checkId: 'deployment', category: 'deployment', status: 'pass', required: true, summary: 'claimed green', evidence: [] }],
  }), /rc_pass_requires_evidence/)
})

test('evidence observed after the readiness snapshot is rejected', () => {
  assert.throws(() => evaluateReleaseCandidateReadiness({
    tenant: { tenantId: 'tenant-a', environmentId: 'prod' },
    generatedAt: '2026-08-10T03:11:00.000Z',
    checks: [{ checkId: 'deployment', category: 'deployment', status: 'pass', required: true, summary: 'production deployment green', evidence: [{ ...evidence[0], observedAt: '2026-08-10T03:12:00.000Z' }] }],
  }), /rc_evidence_timestamp_after_snapshot/)
})

test('not-run required evidence blocks RC status', () => {
  const snapshot = evaluateReleaseCandidateReadiness({
    tenant: { tenantId: 'tenant-a', environmentId: 'prod' },
    generatedAt: '2026-08-10T03:11:00.000Z',
    checks: [{ checkId: 'pentest', category: 'security', status: 'not_run', required: true, summary: 'external penetration test', evidence: [] }],
  })
  assert.equal(snapshot.releaseCandidate, false)
  assert.deepEqual(snapshot.notRunRequiredCheckIds, ['pentest'])
})

test('load profile enforces soak, latency, errors, and tenant bounds', () => {
  assert.equal(evaluateLoadProfile({ concurrentTenants: 200, requestsPerSecond: 500, p95LatencyMs: 600, errorRate: 0.001, durationMinutes: 60, maxConcurrentTenants: 250, maxP95LatencyMs: 1000, maxErrorRate: 0.01, minDurationMinutes: 30 }).pass, true)
  assert.equal(evaluateLoadProfile({ concurrentTenants: 251, requestsPerSecond: 500, p95LatencyMs: 600, errorRate: 0.001, durationMinutes: 60, maxConcurrentTenants: 250, maxP95LatencyMs: 1000, maxErrorRate: 0.01, minDurationMinutes: 30 }).pass, false)
})

test('recovery evidence validates backup, restore, failover, RPO and RTO', () => {
  assert.equal(evaluateRecoveryEvidence({ backupVerifiedAt: '2026-08-10T01:00:00.000Z', restoreVerifiedAt: '2026-08-10T01:20:00.000Z', failoverVerifiedAt: '2026-08-10T01:30:00.000Z', recoveryPointMinutes: 5, recoveryTimeMinutes: 20, maxRecoveryPointMinutes: 15, maxRecoveryTimeMinutes: 30 }).pass, true)
})

test('observability requires telemetry, alerts, traces, dashboards and audit sink', () => {
  assert.equal(evaluateObservability({ telemetryCoverage: 0.99, alertCoverage: 0.97, traceCoverage: 0.96, dashboardsAvailable: true, auditSinkAvailable: true, minCoverage: 0.95 }).pass, true)
})

test('multi-tenant isolation rejects any cross-tenant exposure', () => {
  const result = evaluateTenantIsolation([
    { probeId: 'p1', sourceTenant: 'tenant-a', targetTenant: 'tenant-b', blocked: true, leakedFields: [] },
    { probeId: 'p2', sourceTenant: 'tenant-b', targetTenant: 'tenant-a', blocked: true, leakedFields: [] },
  ])
  assert.equal(result.pass, true)
})

test('security readiness remains blocked until penetration testing passes', () => {
  const blocked = evaluateSecurityEvidence({ dependencyAuditPass: true, secretScanPass: true, authzRegressionPass: true, tenantIsolationPass: true, penetrationTestStatus: 'not_run', criticalFindings: 0, highFindings: 0 })
  assert.equal(blocked.pass, false)
  assert.match(blocked.reasons.join(','), /penetration_test_not_run/)

  const pass = evaluateSecurityEvidence({ dependencyAuditPass: true, secretScanPass: true, authzRegressionPass: true, tenantIsolationPass: true, penetrationTestStatus: 'pass', criticalFindings: 0, highFindings: 0 })
  assert.equal(pass.pass, true)
})
