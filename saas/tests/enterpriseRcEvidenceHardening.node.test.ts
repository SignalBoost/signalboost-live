import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MARKETING_SALES_RC_REQUIREMENTS,
  evaluateReleaseCandidateReadiness,
  getMarketingSalesRcEvidenceCoverage,
  type MarketingSalesRcEvidenceMap,
} from '../lib/release-candidate/index.ts'

const tenant = { tenantId: 'tenant-a', environmentId: 'prod' }
const generatedAt = '2026-08-12T19:00:00.000Z'

test('RC rejects pass without evidence', () => {
  assert.throws(() => evaluateReleaseCandidateReadiness({
    tenant,
    generatedAt,
    checks: [{ checkId: 'deployment', category: 'deployment', status: 'pass', required: true, summary: 'claimed pass', evidence: [] }],
  }), /rc_pass_requires_evidence/)
})

test('RC rejects future-dated evidence', () => {
  assert.throws(() => evaluateReleaseCandidateReadiness({
    tenant,
    generatedAt,
    checks: [{ checkId: 'deployment', category: 'deployment', status: 'pass', required: true, summary: 'green', evidence: [{ ref: 'vercel:green', kind: 'deployment', observedAt: '2026-08-12T19:01:00.000Z' }] }],
  }), /rc_evidence_timestamp_after_snapshot/)
})

test('Marketing & Sales evidence coverage reports remaining gates', () => {
  const evidence: MarketingSalesRcEvidenceMap = {}
  for (const requirement of MARKETING_SALES_RC_REQUIREMENTS.slice(0, 6)) {
    evidence[requirement.checkId] = { status: 'pass', evidence: [{ ref: `evidence://${requirement.checkId}`, kind: 'report', observedAt: generatedAt }] }
  }
  const coverage = getMarketingSalesRcEvidenceCoverage(evidence)
  assert.equal(coverage.totalRequired, 8)
  assert.equal(coverage.supplied, 6)
  assert.equal(coverage.passedWithEvidence, 6)
  assert.equal(coverage.missingCheckIds.length, 2)
})
