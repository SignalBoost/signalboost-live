// saas/tests/cosEvidenceSourceUse.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HIGH_VALUE_RATE,
  LOW_UTILIZATION_RATE,
  MINIMUM_INJECTIONS_FOR_VERDICT,
  attributeCitations,
  attributeSourceKinds,
  rollupSourceKindUse,
  sourceKindFromEvidenceLine,
  sourceKindVerdict,
} from '../lib/ai/cos/evidenceSourceUse.ts'
import {
  captureEvidenceSourceUseTurnId,
  captureLearnedCitationIndices,
  captureSelectedLearnedSourceKinds,
  consumeEvidenceSourceUseTurn,
} from '../lib/ai/cos/evidenceSourceUseTurnContext.ts'

const journal = '[CL1] postgres indexing: summary [retrieved content; confidence 0.81; similarity 0.44; scientific_journal https://example.org/paper]'
const docs = '[CL2] vercel limits: summary [retrieved content; confidence 0.90; similarity 0.61; official_documentation https://vercel.com/docs]'
const transcript = '[CL3] sre talk: summary [reference pointer; confidence 0.70; similarity 0.40; video_transcript https://example.com/v]'

test('structured source kinds are the authoritative runtime attribution path', () => {
  const use = attributeSourceKinds(['scientific_journal', 'official_documentation', 'video_transcript'], [2])
  assert.equal(use.injected, 3)
  assert.equal(use.cited, 1)
  assert.equal(use.bySourceKind.find(item => item.sourceKind === 'official_documentation')?.cited, 1)
  assert.equal(use.bySourceKind.find(item => item.sourceKind === 'scientific_journal')?.cited, 0)
})

test('legacy rendered-line parser fails honest to unknown', () => {
  assert.equal(sourceKindFromEvidenceLine(journal), 'scientific_journal')
  assert.equal(sourceKindFromEvidenceLine(docs), 'official_documentation')
  assert.equal(sourceKindFromEvidenceLine(transcript), 'video_transcript')
  assert.equal(sourceKindFromEvidenceLine('[CL1] no metadata block'), 'unknown')
})

test('zero citations is measured rather than hidden', () => {
  const use = attributeCitations([journal, docs, transcript], [])
  assert.equal(use.injected, 3)
  assert.equal(use.cited, 0)
  assert.ok(use.bySourceKind.every(entry => entry.cited === 0))
})

test('hallucinated and duplicate citations cannot inflate utilization', () => {
  const use = attributeSourceKinds(['scientific_journal', 'official_documentation'], [2, 2, 9, 0, -1])
  assert.equal(use.cited, 1)
  assert.equal(use.bySourceKind.find(item => item.sourceKind === 'official_documentation')?.cited, 1)
})

test('graded verdicts do not call 1/200 useful', () => {
  assert.equal(sourceKindVerdict(MINIMUM_INJECTIONS_FOR_VERDICT - 1, 0), 'insufficient_evidence')
  assert.equal(sourceKindVerdict(MINIMUM_INJECTIONS_FOR_VERDICT, 0), 'never_cited')
  assert.equal(sourceKindVerdict(200, 1), 'low_utilization')
  assert.equal(sourceKindVerdict(100, Math.ceil(LOW_UTILIZATION_RATE * 100)), 'useful')
  assert.equal(sourceKindVerdict(100, Math.ceil(HIGH_VALUE_RATE * 100)), 'high_value')
})

test('rollup distinguishes consistently useful docs from never-cited journals', () => {
  const uses = [
    ...Array.from({ length: MINIMUM_INJECTIONS_FOR_VERDICT }, () => attributeSourceKinds(['official_documentation'], [1])),
    ...Array.from({ length: MINIMUM_INJECTIONS_FOR_VERDICT }, () => attributeSourceKinds(['scientific_journal'], [])),
  ]
  const rollup = rollupSourceKindUse(uses)
  assert.equal(rollup.find(item => item.sourceKind === 'official_documentation')?.verdict, 'high_value')
  assert.equal(rollup.find(item => item.sourceKind === 'scientific_journal')?.verdict, 'never_cited')
})

test('request-local correlation joins selected source kinds, reasoner turn id and final CL citations', () => {
  captureSelectedLearnedSourceKinds([
    { source_kind: 'scientific_journal' },
    { item: { source_kind: 'official_documentation' }, summary: 'wrapped fallback row' },
  ])
  captureEvidenceSourceUseTurnId('11111111-1111-4111-8111-111111111111')
  captureLearnedCitationIndices([2])
  const captured = consumeEvidenceSourceUseTurn()
  assert.deepEqual(captured, {
    turnId: '11111111-1111-4111-8111-111111111111',
    sourceKinds: ['scientific_journal', 'official_documentation'],
    citedIndices: [2],
  })
  assert.equal(consumeEvidenceSourceUseTurn(), null, 'the correlation envelope is consumed once')
})
