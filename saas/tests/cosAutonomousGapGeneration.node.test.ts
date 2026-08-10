import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKnowledgeGaps } from '../lib/cos-core/layers/learning/gaps'

test('COS creates and prioritizes study gaps from uncertainty without a provider', () => {
  const gaps = generateKnowledgeGaps([
    {
      taskId: 't1',
      subject: 'prospect discovery',
      capability: 'prospecting',
      objective: 'find qualified Brazilian MSPs',
      confidence: 0.45,
      escalated: true,
      succeeded: false,
      missingFacts: ['current provider coverage'],
      repeatedCount: 4,
      externalCostUsd: 0.02,
      evidence: ['two recent escalations'],
      portableIds: ['marketing-sales'],
    },
    {
      taskId: 't2',
      subject: 'known routine',
      capability: 'routine',
      objective: 'reuse known local procedure',
      confidence: 0.95,
      succeeded: true,
    },
  ])

  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].subject, 'prospect discovery')
  assert.match(gaps[0].question, /current provider coverage/)
  assert.ok(gaps[0].urgency >= 80)
  assert.ok(gaps[0].expectedReuse >= 7)
  assert.ok(gaps[0].expectedAvoidedCostUsd > 0)
  assert.deepEqual(gaps[0].portableIds, ['marketing-sales'])
})

test('COS deduplicates equivalent study gaps and keeps the more urgent signal', () => {
  const gaps = generateKnowledgeGaps([
    {
      taskId: 'a', subject: 'email delivery', capability: 'email', objective: 'deliver outreach drafts',
      confidence: 0.65, repeatedCount: 2,
    },
    {
      taskId: 'b', subject: 'email delivery', capability: 'email', objective: 'deliver outreach drafts',
      confidence: 0.3, escalated: true, succeeded: false, repeatedCount: 5,
    },
  ])
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].id, 'auto-gap:b:email')
})
