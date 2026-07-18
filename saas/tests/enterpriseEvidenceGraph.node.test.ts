import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEnterpriseEvidenceGraph, traverseEvidenceGraph } from '../lib/enterprise/memory/evidenceGraph.ts'
import type { EnterpriseMemoryCandidate } from '../lib/enterprise/memory/retrievalRanking.ts'

const candidates: EnterpriseMemoryCandidate[] = [
  {
    id: 'org-1',
    kind: 'organization',
    confidence: 0.9,
    payload: { name: 'SignalBoost' },
  },
  {
    id: 'repo-1',
    kind: 'repository',
    confidence: 0.8,
    payload: { owner: 'SignalBoost', name: 'signalboost-live' },
  },
  {
    id: 'campaign-1',
    kind: 'campaign',
    workspace: 'campaign-studio',
    confidence: 0.75,
    performanceScore: 0.7,
    payload: {
      campaignId: 'campaign-1',
      objective: 'awareness',
      performanceData: { score: 0.7 },
    },
  },
  {
    id: 'approval-1',
    kind: 'approval',
    payload: { campaignId: 'campaign-1', decision: 'approved' },
  },
  {
    id: 'confidence-1',
    kind: 'confidence',
    confidence: 2,
    payload: { campaignId: 'campaign-1', adjustedConfidence: 0.72 },
  },
]

test('builds deterministic typed evidence nodes and relationships', () => {
  const graph = buildEnterpriseEvidenceGraph({ organizationId: 'org-1', candidates })

  assert.equal(graph.organizationId, 'org-1')
  assert.deepEqual(graph.nodes.map(node => node.id), [...graph.nodes.map(node => node.id)].sort())
  assert.ok(graph.edges.some(edge => edge.relation === 'APPROVES' && edge.to === 'campaign:campaign-1'))
  assert.ok(graph.edges.some(edge => edge.relation === 'CALIBRATES' && edge.to === 'campaign:campaign-1'))
  assert.ok(graph.edges.some(edge => edge.relation === 'BELONGS_TO' && edge.from === 'repository:repo-1'))
  assert.ok(graph.edges.some(edge => edge.relation === 'MEASURES' && edge.from === 'campaign:campaign-1'))
  assert.equal(graph.nodes.find(node => node.id === 'confidence:confidence-1')?.confidence, 1)
})

test('deduplicates candidates and ignores empty identities', () => {
  const graph = buildEnterpriseEvidenceGraph({
    organizationId: 'org-1',
    candidates: [candidates[0], candidates[0], { ...candidates[1], id: '' }],
  })

  assert.equal(graph.nodes.length, 1)
  assert.equal(graph.nodes[0].id, 'organization:org-1')
})

test('traverses evidence in bounded deterministic breadth-first order', () => {
  const graph = buildEnterpriseEvidenceGraph({ organizationId: 'org-1', candidates })
  const result = traverseEvidenceGraph(graph, 'campaign:campaign-1', { maxDepth: 1 })

  assert.ok(result.nodes.some(node => node.id === 'approval:approval-1'))
  assert.ok(result.nodes.some(node => node.id === 'confidence:confidence-1'))
  assert.ok(result.nodes.some(node => node.id === 'organization:org-1'))
  assert.ok(result.nodes.length <= 50)
})

test('filters traversal by relation and returns empty output for unknown nodes', () => {
  const graph = buildEnterpriseEvidenceGraph({ organizationId: 'org-1', candidates })
  const approvals = traverseEvidenceGraph(graph, 'campaign:campaign-1', {
    maxDepth: 2,
    relations: ['APPROVES'],
  })

  assert.deepEqual(approvals.edges.map(edge => edge.relation), ['APPROVES'])
  assert.deepEqual(traverseEvidenceGraph(graph, 'campaign:missing'), { nodes: [], edges: [] })
})

test('rejects unsafe graph and traversal bounds', () => {
  assert.throws(() => buildEnterpriseEvidenceGraph({ organizationId: ' ', candidates }), /organizationId is required/)
  const graph = buildEnterpriseEvidenceGraph({ organizationId: 'org-1', candidates })
  assert.throws(() => traverseEvidenceGraph(graph, 'campaign:campaign-1', { maxDepth: 9 }), /maxDepth/)
  assert.throws(() => traverseEvidenceGraph(graph, 'campaign:campaign-1', { maxNodes: 0 }), /maxNodes/)
})
