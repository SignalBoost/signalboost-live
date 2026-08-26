import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateKnowledgePromotionRelevance, knowledgePromotionSourceAllowed } from '../lib/ai/cos/knowledgePromotionRelevance'

const options = { minSubjectMatches: 2, minSubjectCoverage: 0.3 }

test('relevant Kubernetes material is eligible for structured KG promotion', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'official_documentation',
    subject: 'cloud architecture containers Kubernetes serverless reliability',
    sourceTitle: 'CVE-2024-5321',
    summary: 'A Kubernetes security issue affects clusters with Windows nodes and container log permissions.',
    confidence: 0.83,
  }, options)

  assert.equal(decision.eligible, true)
  assert.ok(decision.matchedAnchors.includes('kubernetes'))
  assert.ok(decision.matchedAnchors.includes('containers'))
})

test('benchmark fixtures can never auto-promote into durable Knowledge Graph facts', () => {
  assert.equal(knowledgePromotionSourceAllowed('benchmark_fixture'), false)
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'benchmark_fixture',
    subject: 'Database and data-layer performance',
    sourceTitle: 'Synthetic benchmark fixture',
    summary: 'Database data-layer performance improves when the benchmark fixture uses a synthetic index.',
    confidence: 0.99,
  }, options)

  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'source_not_allowed')
})

test('unknown source kinds fail closed even when relevance and confidence are strong', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'model_generated_test_material',
    subject: 'Enterprise cybersecurity incident response',
    sourceTitle: 'Enterprise cybersecurity incident response',
    summary: 'Enterprise cybersecurity incident response contains a detailed and apparently relevant procedure.',
    confidence: 1,
  }, options)

  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'source_not_allowed')
})

test('a lung-disease paper cannot become database-performance knowledge just because it says performance', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'scientific_journal',
    subject: 'Database and data-layer performance',
    sourceTitle: 'LDSC: enhancing lung disease diagnosis using a simple 1D-CNN',
    summary: 'The model improves diagnostic performance for lung disease classification from clinical signals.',
    confidence: 0.87,
  }, options)

  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'insufficient_subject_overlap')
  assert.deepEqual(decision.matchedAnchors, ['performance'])
})

test('a psychiatry architecture mention cannot become distributed-systems knowledge', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'scientific_journal',
    subject: 'Distributed systems architecture',
    sourceTitle: 'Beyond DSM Categories: Criteria for Biologically Valid Disease Axes in Psychiatry',
    summary: 'The paper discusses inferential errors in treating reproducible factors as evidence of disease architecture.',
    confidence: 0.92,
  }, options)

  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'insufficient_subject_overlap')
})

test('eye-tracking acoustics cannot become computer-vision/spatial-perception KG facts from one weak anchor', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'scientific_journal',
    subject: 'Computer vision and spatial perception',
    sourceTitle: 'Integrating Eye Tracking in Acoustic Research: Sound Localization and Perceptual Analysis',
    summary: 'Reviewed studies focus on eye-tracking in acoustics, sound event detection, acoustic sensing, and perceptual acoustic studies.',
    confidence: 0.92,
  }, options)

  assert.equal(decision.eligible, false)
  assert.equal(decision.matchedAnchors.length, 1)
  assert.equal(decision.matchedAnchors[0], 'perception')
})

test('compound subject words tolerate source prose that uses spaces instead of hyphens', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'scientific_journal',
    subject: 'Database and data-layer performance',
    sourceTitle: 'Optimizing a database data layer',
    summary: 'The database data layer reduces query latency and improves performance under contention.',
    confidence: 0.9,
  }, options)

  assert.equal(decision.eligible, true)
  assert.ok(decision.matchedAnchors.includes('data-layer'))
})

test('subject relevance does not override a source-confidence floor', () => {
  const decision = evaluateKnowledgePromotionRelevance({
    sourceKind: 'news_article',
    subject: 'Enterprise cybersecurity',
    sourceTitle: 'Enterprise cybersecurity incident response',
    summary: 'Enterprise cybersecurity teams coordinate incident response after a supply-chain compromise.',
    confidence: 0.5,
  }, options)

  assert.equal(decision.eligible, false)
  assert.equal(decision.reason, 'below_source_confidence_floor')
})
