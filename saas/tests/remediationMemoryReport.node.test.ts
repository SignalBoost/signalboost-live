import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRemediationMemoryReport } from '../lib/supervisor/remediation-memory-report.ts'

test('owner remediation report separates recommendation from execution authority', () => {
  const report = buildRemediationMemoryReport([
    { incidentKey: 'queue', remedyId: 'restart-worker', verifiedSuccesses: 3, verifiedFailures: 0, consecutiveFailures: 0, recommendationEligible: true, updatedAt: 2 },
    { incidentKey: 'queue', remedyId: 'scale-worker', verifiedSuccesses: 4, verifiedFailures: 1, consecutiveFailures: 1, recommendationEligible: true, updatedAt: 3 },
    { incidentKey: 'cache', remedyId: 'invalidate', verifiedSuccesses: 1, verifiedFailures: 0, consecutiveFailures: 0, recommendationEligible: false, updatedAt: 1 },
  ])
  assert.deepEqual({ total: report.total, eligible: report.eligible, withdrawn: report.withdrawnOrUnproven }, { total: 3, eligible: 1, withdrawn: 2 })
  assert.equal(report.items[0].remedyId, 'restart-worker')
  assert.match(report.items[0].reason, /human review/)
  assert.match(report.items.find(item => item.remedyId === 'scale-worker')!.reason, /Withdrawn/)
})
