import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeCuratedSnapshot } from '../lib/prospect-intelligence/promotion.ts'

test('mergeCuratedSnapshot deduplicates by domain and keeps stronger record', () => {
  const existing = [{
    id: 'OLD', company: 'Example', country: 'US', website: 'https://example.com/', email: 'old@example.com', industry: 'Cloud', technicalFit: 70, revenuePotential: 70, status: 'READY',
  }]
  const candidates = [{
    organizationId: '1', canonicalDomain: 'example.com', confidence: 0.95,
    id: 'NEW', company: 'Example', country: 'US', website: 'https://www.example.com/', email: 'sales@example.com', industry: 'Cloud', technicalFit: 95, revenuePotential: 90, status: 'READY',
  }]
  const merged = mergeCuratedSnapshot(existing, candidates)
  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.id, 'NEW')
  assert.equal(merged[0]?.email, 'sales@example.com')
})

test('mergeCuratedSnapshot preserves distinct organizations', () => {
  const existing = [{
    id: 'A', company: 'A', country: 'US', website: 'https://a.example/', email: 'sales@a.example', industry: 'Cloud', technicalFit: 90, revenuePotential: 80, status: 'READY',
  }]
  const candidates = [{
    organizationId: '2', canonicalDomain: 'b.example', confidence: 0.9,
    id: 'B', company: 'B', country: 'US', website: 'https://b.example/', email: 'sales@b.example', industry: 'Cloud', technicalFit: 85, revenuePotential: 85, status: 'READY',
  }]
  assert.equal(mergeCuratedSnapshot(existing, candidates).length, 2)
})
