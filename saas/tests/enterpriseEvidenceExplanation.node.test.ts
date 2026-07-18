import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEnterpriseEvidenceGraph } from '../lib/enterprise/memory/evidenceGraph.ts'
import { buildEvidenceBasedExplanation } from '../lib/enterprise/memory/evidenceExplanation.ts'
import type { RankedEnterpriseMemory } from '../lib/enterprise/memory/retrievalRanking.ts'

const ranked: RankedEnterpriseMemory[] = [
  {
    id: 'campaign-1',
    kind: 'campaign',
    workspace: 'campaign-studio',
    confidence: 0.8,
    approved: true,
    performanceScore: 0.9,
    occurredAt: '2026-07-18T12:00:00.000Z',
    taskTags: ['linkedin'],
    payload: { campaignId: 'campaign-1', cta: 'Start free', executionStatus: 'measured' },
    score: 91,
    reasons: ['human_approved', 'performance:0.90'],
  },
  {
    id: 'approval-1',
    kind: 'approval',
    confidence: 0.6,
    occurredAt: '2026-07-18T11:00:00.000Z',
    payload: { campaignId: 'campaign-1', decision: 'approved' },
    score: 60,
    reasons: ['human_approved'],
  },
]

const graph = buildEnterpriseEvidenceGraph({ organizationId: 'org-1', candidates: ranked })

test('builds a bounded explanation from traceable graph nodes', () => {
  const result = buildEvidenceBasedExplanation({
    recommendation: 'Use the Start free CTA.',
    rankedMemory: ranked,
    graph,
  })

  assert.equal(result.recommendation, 'Use the Start free CTA.')
  assert.equal(result.evidence.length, 2)
  assert.equal(result.evidence[0].nodeId, 'campaign:campaign-1')
  assert.equal(result.evidence[0].reason, 'Campaign used CTA: Start free')
  assert.equal(result.evidence[1].reason, 'Human approved')
  assert.equal(result.confidence, 0.7)
})

test('does not invent evidence when ranked memory is absent from the graph', () => {
  const result = buildEvidenceBasedExplanation({
    recommendation: 'Keep the current CTA.',
    rankedMemory: [{ ...ranked[0], id: 'missing' }],
    graph,
  })

  assert.equal(result.confidence, 0)
  assert.deepEqual(result.evidence, [])
  assert.match(result.summary, /No traceable/)
})

test('deduplicates evidence and enforces maxEvidence', () => {
  const result = buildEvidenceBasedExplanation({
    recommendation: 'Use the strongest supported campaign.',
    rankedMemory: [ranked[0], ranked[0], ranked[1]],
    graph,
    maxEvidence: 1,
  })

  assert.equal(result.evidence.length, 1)
})

test('rejects unsafe or empty requests', () => {
  assert.throws(() => buildEvidenceBasedExplanation({ recommendation: '', rankedMemory: ranked, graph }))
  assert.throws(() => buildEvidenceBasedExplanation({ recommendation: 'x', rankedMemory: ranked, graph, maxEvidence: 13 }))
})
