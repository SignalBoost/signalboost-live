import assert from 'node:assert/strict'
import test from 'node:test'
import { extractSambaSchoolNames, isNamedCatalogListRequest, isNamedCatalogResearchRequest, isPublicPageExtractionCatalogRequest } from '../lib/ai/cos/listCatalogIntent.ts'
import { classifyKnowledgeAccess } from '../lib/ai/cos/knowledgeAccessPolicy.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('São Paulo várzea study list uses dedicated multi-query public-page research', () => {
  const prompt = 'me de uma lista com 50 times do futebol amador/varzea de Sao Paulo'
  assert.equal(isNamedCatalogResearchRequest(prompt), true)
  assert.equal(isNamedCatalogListRequest(prompt), true)
  assert.equal(requiresFreshExternalEvidence(prompt), false, 'cultural/reference catalog is not automatically a clock-sensitive fact')
  assert.equal(classifyKnowledgeAccess(prompt).mode, 'search_if_thin', 'fallback policy remains public research if the dedicated route is bypassed')
})

test('other real-world named catalogs still research instead of relying on model memory', () => {
  assert.equal(isNamedCatalogListRequest('List 20 independent museums in Chicago'), false)
  assert.equal(classifyKnowledgeAccess('List 20 independent museums in Chicago').mode, 'search_if_thin')
})

test('current roster / score requests do not enter the cultural catalog route', () => {
  assert.equal(isNamedCatalogListRequest('give me the current roster of amateur football teams in Sao Paulo this weekend'), false)
  assert.equal(requiresFreshExternalEvidence("what is today's NBA score"), true)
  assert.equal(classifyKnowledgeAccess("what is today's NBA score").mode, 'live_required')
})


test('São Paulo samba-school catalog reads public pages instead of refusing from model memory', () => {
  const prompt = 'me de a lista de 20 escolas de samba do primeiro grupo de sao paulo'
  assert.equal(isPublicPageExtractionCatalogRequest(prompt), true)
  assert.equal(isNamedCatalogListRequest(prompt), false, 'the dedicated football extractor must remain scoped')
  assert.equal(requiresFreshExternalEvidence(prompt), false, 'a published group catalog is not automatically a clock-sensitive event roster')
})


test('samba extractor accepts only names under the publisher Grupo Especial section', () => {
  const names = extractSambaSchoolNames([{
    title: 'Liga-SP',
    snippet: [
      'Todos os direitos reservados',
      'Ir para o conteúdo',
      'Grupo Especial',
      'Mocidade Alegre',
      'Gaviões da Fiel',
      'Vai-Vai',
      'Grupo de Acesso 1',
      'Rosas de Ouro',
    ].join('\n'),
  }])
  assert.deepEqual(names, ['Mocidade Alegre', 'Gaviões da Fiel', 'Vai-Vai'])
})
