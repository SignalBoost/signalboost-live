import assert from 'node:assert/strict'
import test from 'node:test'
import { isNamedCatalogListRequest, isNamedCatalogResearchRequest } from '../lib/ai/cos/listCatalogIntent.ts'
import { classifyKnowledgeAccess } from '../lib/ai/cos/knowledgeAccessPolicy.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('São Paulo várzea study list researches public pages without pretending it is a current roster', () => {
  const prompt = 'me de uma lista com 50 times do futebol amador/varzea de Sao Paulo'
  assert.equal(isNamedCatalogResearchRequest(prompt), true)
  assert.equal(isNamedCatalogListRequest(prompt), false, 'legacy regex-harvest interceptor must stay disabled')
  assert.equal(requiresFreshExternalEvidence(prompt), false, 'cultural/reference catalog is not automatically a clock-sensitive fact')
  assert.equal(classifyKnowledgeAccess(prompt).mode, 'search_if_thin')
})

test('English real-world named catalogs also research instead of relying on model memory', () => {
  assert.equal(classifyKnowledgeAccess('Give me a list of 30 neighborhood football clubs in London').mode, 'search_if_thin')
  assert.equal(classifyKnowledgeAccess('List 20 independent museums in Chicago').mode, 'search_if_thin')
})

test('today\'s scores stay live', () => {
  assert.equal(requiresFreshExternalEvidence("what is today's NBA score"), true)
  assert.equal(classifyKnowledgeAccess("what is today's NBA score").mode, 'live_required')
})
