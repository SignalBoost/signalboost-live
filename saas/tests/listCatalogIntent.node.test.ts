import assert from 'node:assert/strict'
import test from 'node:test'
import { isNamedCatalogListRequest } from '../lib/ai/cos/listCatalogIntent.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('várzea São Paulo list is a catalog request, not a live lookup', () => {
  const prompt = 'me de uma lista com 50 times do futebol amador/varzea de Sao Paulo'
  assert.equal(isNamedCatalogListRequest(prompt), true)
  assert.equal(requiresFreshExternalEvidence(prompt), false)
})

test('today\'s scores stay live', () => {
  assert.equal(requiresFreshExternalEvidence("what is today's NBA score"), true)
})
