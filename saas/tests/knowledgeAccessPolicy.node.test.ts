import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyKnowledgeAccess } from '../lib/ai/cos/knowledgeAccessPolicy.ts'

test('várzea list is search-if-thin, not live-required', () => {
  const d = classifyKnowledgeAccess('me de uma lista com 50 times do futebol amador/varzea de Sao Paulo')
  assert.equal(d.mode, 'search_if_thin')
})

test('flights stay live-required', () => {
  const d = classifyKnowledgeAccess('are there direct flights from Paramaribo to Sao Paulo?')
  assert.equal(d.mode, 'live_required')
})

test('advisory diagnosis stays internal-first', () => {
  const d = classifyKnowledgeAccess(
    'A 1.2 MW high-density compute row experiences a 15% transient spike. Discriminate DVFS vs ToR packet pacing vs checkpoint preemption. Do not pick a winner.',
  )
  assert.equal(d.mode, 'internal_first')
})
