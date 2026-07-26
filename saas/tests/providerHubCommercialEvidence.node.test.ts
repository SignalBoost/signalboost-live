import assert from 'node:assert/strict'
import test from 'node:test'

import {
  providerHubCommercialEvidenceProfile,
  portableCommercialReadinessReport,
} from '../lib/portable-products/index.ts'

test('reports only repository-verified Provider Hub commercial dimensions as complete', () => {
  assert.equal(providerHubCommercialEvidenceProfile.productId, 'provider-hub')
  assert.equal(providerHubCommercialEvidenceProfile.verifiedCount, 4)
  assert.equal(providerHubCommercialEvidenceProfile.totalCount, 10)
  assert.equal(providerHubCommercialEvidenceProfile.completionPercent, 40)
  assert.equal(providerHubCommercialEvidenceProfile.commerciallyReady, false)

  const verified = providerHubCommercialEvidenceProfile.dimensions
    .filter(dimension => dimension.status === 'verified')
    .map(dimension => dimension.dimension)

  assert.deepEqual(verified, [
    'architecture',
    'buyer-installation',
    'buyer-configuration',
    'support-boundary',
  ])
})

test('keeps external Provider Hub go-live evidence fail closed', () => {
  const blocked = new Map(providerHubCommercialEvidenceProfile.dimensions
    .filter(dimension => dimension.status === 'external-evidence-required')
    .map(dimension => [dimension.dimension, dimension.blockers]))

  assert.ok(blocked.get('distribution-package')?.includes('missing-versioned-release-artifact'))
  assert.ok(blocked.get('integrity-manifest')?.includes('missing-release-artifact-sha256-and-size'))
  assert.ok(blocked.get('licensing-enforcement')?.includes('missing-buyer-entitlement-enforcement-evidence'))
  assert.ok(blocked.get('fulfillment-handoff')?.includes('missing-complete-versioned-buyer-handoff-bundle'))
  assert.ok(blocked.get('operations-recovery')?.includes('missing-buyer-backup-infrastructure-and-recovery-rehearsal'))
  assert.ok(blocked.get('deployment-acceptance')?.includes('missing-clean-environment-install-and-buyer-signoff'))
})

test('does not treat recovery documentation as completed recovery evidence', () => {
  const providerHub = portableCommercialReadinessReport.entries.find(entry => entry.productId === 'provider-hub')
  assert.ok(providerHub)
  assert.equal(providerHub.readyCount, 4)
  assert.equal(providerHub.completionPercent, 40)
  assert.equal(providerHub.commerciallyReady, false)

  const recovery = providerHub.checks.find(check => check.dimension === 'operations-recovery')
  assert.equal(recovery?.status, 'blocked')
  assert.deepEqual(recovery?.blockers, ['missing-operations-recovery-evidence'])
})

test('freezes the product-specific evidence profile', () => {
  assert.ok(Object.isFrozen(providerHubCommercialEvidenceProfile))
  assert.ok(Object.isFrozen(providerHubCommercialEvidenceProfile.dimensions))
  assert.ok(providerHubCommercialEvidenceProfile.dimensions.every(dimension => Object.isFrozen(dimension)))
})
