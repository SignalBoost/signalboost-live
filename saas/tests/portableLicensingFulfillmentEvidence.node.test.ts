// saas/tests/portableLicensingFulfillmentEvidence.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { createPortableLicensingFulfillmentEvidence } from '../lib/portable-products/licensing-fulfillment-evidence.ts'

test('fails closed when licensing and fulfillment proof is absent', () => {
  const evidence = createPortableLicensingFulfillmentEvidence({
    productId: 'provider-hub',
    licensing: { status: 'absent', references: [] },
    fulfillment: { status: 'absent', references: [] },
    checkoutEnabled: false,
    billingMutationEnabled: false,
    entitlementMutationEnabled: false,
    fulfillmentMutationEnabled: false,
  })
  assert.equal(evidence.complete, false)
  assert.deepEqual(evidence.blockers, ['missing-licensing-evidence', 'missing-fulfillment-evidence'])
  assert.ok(Object.isFrozen(evidence) && Object.isFrozen(evidence.licensing) && Object.isFrozen(evidence.fulfillment) && Object.isFrozen(evidence.blockers))
})

test('rejects unknown products, invalid statuses, blank references, and mutation claims', () => {
  const evidence = createPortableLicensingFulfillmentEvidence({
    productId: 'unknown-product',
    licensing: { status: 'invalid' as 'verified', references: ['proof.json'] },
    fulfillment: { status: 'documented', references: ['   '] },
    checkoutEnabled: true,
    billingMutationEnabled: false,
    entitlementMutationEnabled: true,
    fulfillmentMutationEnabled: false,
  })
  assert.equal(evidence.complete, false)
  assert.ok(evidence.blockers.includes('unknown-product-id'))
  assert.ok(evidence.blockers.includes('invalid-licensing-status'))
  assert.ok(evidence.blockers.includes('missing-fulfillment-references'))
  assert.ok(evidence.blockers.includes('checkout-enabled'))
  assert.ok(evidence.blockers.includes('entitlement-mutation-enabled'))
  assert.equal(evidence.checkoutEnabled, false)
  assert.equal(evidence.entitlementMutationEnabled, false)
})

test('completes only with registered, read-only licensing and fulfillment evidence', () => {
  const evidence = createPortableLicensingFulfillmentEvidence({
    productId: 'provider-hub',
    licensing: { status: 'verified', references: ['contracts/provider-hub-license-boundary.v1.json'] },
    fulfillment: { status: 'verified', references: ['handoff/provider-hub-release.v1.json'] },
    checkoutEnabled: false,
    billingMutationEnabled: false,
    entitlementMutationEnabled: false,
    fulfillmentMutationEnabled: false,
  })
  assert.equal(evidence.complete, true)
  assert.equal(evidence.licensingReady, true)
  assert.equal(evidence.fulfillmentReady, true)
  assert.deepEqual(evidence.blockers, [])
  assert.equal(evidence.schemaVersion, 'portable-licensing-fulfillment-evidence.v1')
})
