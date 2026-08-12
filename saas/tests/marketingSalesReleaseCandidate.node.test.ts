import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MARKETING_SALES_RC_REQUIREMENTS,
  evaluateMarketingSalesReleaseCandidate,
  getMarketingSalesRcEvidenceCoverage,
  type MarketingSalesRcEvidenceMap,
} from '../lib/release-candidate/index.ts'

const tenant = { tenantId: 'tenant-example', environmentId: 'production-example' }
const generatedAt = '2026-08-10T23:59:00.000Z'

function allPassingEvidence(): MarketingSalesRcEvidenceMap {
  return Object.fromEntries(MARKETING_SALES_RC_REQUIREMENTS.map(requirement => [
    requirement.checkId,
    {
      status: 'pass' as const,
      summary: `${requirement.summary} Verified in the real target environment.`,
      evidence: [{ ref: `evidence://${requirement.checkId}`, kind: 'report' as const, observedAt: generatedAt }],
    },
  ])) as MarketingSalesRcEvidenceMap
}

test('Marketing & Sales RC profile fails closed when operational evidence has not been recorded', () => {
  const snapshot = evaluateMarketingSalesReleaseCandidate({ tenant, generatedAt })
  assert.equal(snapshot.releaseCandidate, false)
  assert.equal(snapshot.requiredPassRate, 0)
  assert.deepEqual(snapshot.notRunRequiredCheckIds, MARKETING_SALES_RC_REQUIREMENTS.map(row => row.checkId).sort())
})

test('Marketing & Sales evidence coverage exposes exactly what remains unproven', () => {
  const evidence = allPassingEvidence()
  delete evidence['marketing_sales.resilience.recovery']
  evidence['marketing_sales.performance.load_soak'] = {
    status: 'warn',
    evidence: [{ ref: 'evidence://partial-load', kind: 'metric', observedAt: generatedAt }],
  }
  const coverage = getMarketingSalesRcEvidenceCoverage(evidence)
  assert.equal(coverage.totalRequired, 8)
  assert.equal(coverage.supplied, 7)
  assert.equal(coverage.passedWithEvidence, 6)
  assert.deepEqual(coverage.missingCheckIds, ['marketing_sales.resilience.recovery'])
  assert.deepEqual(coverage.nonPassingCheckIds, ['marketing_sales.performance.load_soak'])
})

test('Marketing & Sales RC profile becomes true only when every required gate has passing evidence', () => {
  const snapshot = evaluateMarketingSalesReleaseCandidate({ tenant, generatedAt, evidence: allPassingEvidence() })
  assert.equal(snapshot.releaseCandidate, true)
  assert.equal(snapshot.requiredPassRate, 1)
  assert.deepEqual(snapshot.failedRequiredCheckIds, [])
  assert.deepEqual(snapshot.notRunRequiredCheckIds, [])
})

test('a warning on any required Marketing & Sales gate prevents release-candidate status', () => {
  const evidence = allPassingEvidence()
  evidence['marketing_sales.performance.load_soak'] = {
    status: 'warn',
    summary: 'Load/soak evidence is incomplete.',
    evidence: [{ ref: 'evidence://load-soak-partial', kind: 'metric', observedAt: generatedAt }],
  }
  const snapshot = evaluateMarketingSalesReleaseCandidate({ tenant, generatedAt, evidence })
  assert.equal(snapshot.releaseCandidate, false)
  assert.ok(snapshot.warningCheckIds.includes('marketing_sales.performance.load_soak'))
})
