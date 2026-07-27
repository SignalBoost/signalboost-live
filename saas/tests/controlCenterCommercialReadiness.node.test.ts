import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortableCommercialReadinessReport } from '../lib/portable-products/index.ts'

test('Control Center commercial evidence is bounded and honestly incomplete', () => {
  const report = createPortableCommercialReadinessReport()
  const controlCenter = report.entries.find(entry => entry.productId === 'control-center')

  assert.ok(controlCenter)
  assert.equal(controlCenter.readyCount, 4)
  assert.equal(controlCenter.totalCount, 10)
  assert.equal(controlCenter.completionPercent, 40)
  assert.equal(controlCenter.commerciallyReady, false)
  assert.deepEqual(controlCenter.checks.filter(check => check.status === 'ready').map(check => check.dimension), [
    'architecture',
    'buyer-installation',
    'buyer-configuration',
    'support-boundary',
  ])
  assert.deepEqual(controlCenter.checks.filter(check => check.status === 'blocked').map(check => check.dimension), [
    'distribution-package',
    'integrity-manifest',
    'licensing-enforcement',
    'fulfillment-handoff',
    'operations-recovery',
    'deployment-acceptance',
  ])
  const recovery = controlCenter.checks.find(check => check.dimension === 'operations-recovery')
  assert.deepEqual(recovery?.blockers, ['missing-operations-recovery-evidence'])
  for (const check of controlCenter.checks) {
    assert.ok(Object.isFrozen(check) && Object.isFrozen(check.evidence) && Object.isFrozen(check.blockers))
  }
})
