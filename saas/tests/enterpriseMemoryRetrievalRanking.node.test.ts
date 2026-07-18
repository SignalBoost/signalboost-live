import assert from 'node:assert/strict'
import test from 'node:test'
import {
  rankEnterpriseMemoryCandidates,
  type EnterpriseMemoryCandidate,
} from '../lib/enterprise/memory/retrievalRanking.ts'

const NOW = Date.parse('2026-07-18T12:00:00.000Z')

function candidate(overrides: Partial<EnterpriseMemoryCandidate> = {}): EnterpriseMemoryCandidate {
  return {
    id: 'memory-1',
    kind: 'campaign',
    workspace: 'campaign-studio',
    confidence: 0.8,
    approved: false,
    performanceScore: 0,
    occurredAt: '2026-07-17T12:00:00.000Z',
    taskTags: ['linkedin', 'awareness'],
    payload: {},
    ...overrides,
  }
}

test('human-approved memory outranks otherwise equivalent unapproved memory', () => {
  const ranked = rankEnterpriseMemoryCandidates([
    candidate({ id: 'unapproved' }),
    candidate({ id: 'approved', approved: true }),
  ], { now: NOW })

  assert.equal(ranked[0].id, 'approved')
  assert.ok(ranked[0].reasons.includes('human_approved'))
})

test('workspace and task relevance influence ranking', () => {
  const ranked = rankEnterpriseMemoryCandidates([
    candidate({ id: 'other', workspace: 'store', taskTags: ['email'] }),
    candidate({ id: 'matching', workspace: 'campaign-studio', taskTags: ['linkedin'] }),
  ], { workspace: 'campaign-studio', taskTags: ['linkedin'], now: NOW })

  assert.equal(ranked[0].id, 'matching')
  assert.ok(ranked[0].reasons.includes('workspace_match'))
  assert.ok(ranked[0].reasons.some(reason => reason.startsWith('task_match:')))
})

test('confidence, performance, and recency are bounded and deterministic', () => {
  const rows = [
    candidate({ id: 'older', confidence: 5, performanceScore: -3, occurredAt: '2025-01-01T00:00:00.000Z' }),
    candidate({ id: 'newer', confidence: 0.6, performanceScore: 0.9, occurredAt: '2026-07-18T11:00:00.000Z' }),
  ]
  const first = rankEnterpriseMemoryCandidates(rows, { now: NOW })
  const second = rankEnterpriseMemoryCandidates(rows, { now: NOW })

  assert.deepEqual(first, second)
  assert.equal(first[0].id, 'newer')
  assert.ok(first.every(item => item.score >= -5 && item.score <= 100))
})

test('duplicates are removed by kind and id before ranking', () => {
  const ranked = rankEnterpriseMemoryCandidates([
    candidate({ id: 'same', approved: false }),
    candidate({ id: 'same', approved: true }),
    candidate({ id: 'same', kind: 'repository', approved: true }),
  ], { now: NOW })

  assert.equal(ranked.length, 2)
  assert.deepEqual(ranked.map(item => `${item.kind}:${item.id}`).sort(), ['campaign:same', 'repository:same'])
})

test('invalid identities are ignored and limit is enforced', () => {
  const ranked = rankEnterpriseMemoryCandidates([
    candidate({ id: '' }),
    candidate({ id: 'one' }),
    candidate({ id: 'two' }),
  ], { now: NOW, limit: 1 })

  assert.equal(ranked.length, 1)
  assert.notEqual(ranked[0].id, '')
})

test('invalid clock and limits fail closed', () => {
  assert.throws(() => rankEnterpriseMemoryCandidates([], { now: Number.NaN }), /clock must be finite/)
  assert.throws(() => rankEnterpriseMemoryCandidates([], { limit: 0 }), /limit must be an integer/)
  assert.throws(() => rankEnterpriseMemoryCandidates([], { limit: 51 }), /limit must be an integer/)
})

test('future and malformed dates receive no recency advantage', () => {
  const ranked = rankEnterpriseMemoryCandidates([
    candidate({ id: 'future', occurredAt: '2027-01-01T00:00:00.000Z' }),
    candidate({ id: 'bad-date', occurredAt: 'not-a-date' }),
  ], { now: NOW })

  assert.ok(ranked.every(item => !item.reasons.some(reason => reason.startsWith('recency:'))))
})
