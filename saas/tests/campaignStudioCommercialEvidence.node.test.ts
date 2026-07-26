import assert from 'node:assert/strict'
import test from 'node:test'

import { createPortableCommercialReadinessReport } from '../lib/portable-products/index.ts'

test('Campaign Studio commercial evidence remains fail-closed', () => {
  const report = createPortableCommercialReadinessReport()
  const campaignStudio = report.entries.find(entry => entry.productId === 'campaign-studio')

  assert.ok(campaignStudio)
  assert.equal(campaignStudio.readyCount, 4)
  assert.equal(campaignStudio.totalCount, 10)
  assert.equal(campaignStudio.completionPercent, 40)
  assert.equal(campaignStudio.commerciallyReady, false)
  assert.deepEqual(campaignStudio.checks.filter(check => check.status === 'ready').map(check => check.dimension), [
    'architecture',
    'buyer-installation',
    'buyer-configuration',
    'support-boundary',
  ])

  const recovery = campaignStudio.checks.find(check => check.dimension === 'operations-recovery')
  assert.equal(recovery?.status, 'blocked')
  assert.deepEqual(recovery?.blockers, ['missing-operations-recovery-evidence'])
})
