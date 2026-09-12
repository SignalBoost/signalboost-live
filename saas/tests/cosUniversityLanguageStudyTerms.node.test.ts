// saas/tests/cosUniversityLanguageStudyTerms.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  platformLanguageStudyGapSignal,
  selectCosUniversityStudyStrategy,
} from '../lib/ai/cos/cosUniversityStudyStrategy.ts'

const languageStrategy = selectCosUniversityStudyStrategy({ failureClass: 'language' })
import { generateKnowledgeGaps } from '../lib/cos-core/layers/learning/gaps.ts'

function wholeLanguageSignal(studyVariant?: number) {
  return platformLanguageStudyGapSignal({
    planKey: '71ef90dc400fb1925734b2f4fbedf481238984271a2032e9686af1110cf20cff',
    language: 'pt',
    dimension: null,
    objective: 'restore Portuguese language competence',
    strategy: languageStrategy,
    ...(studyVariant === undefined ? {} : { studyVariant }),
  })
}

test('a whole-language plan carries study themes instead of nothing', () => {
  const signal = wholeLanguageSignal()
  assert.ok(signal.missingFacts?.length, 'a dimensionless language plan had no study themes at all')
  assert.ok(signal.missingFacts?.every(fact => fact.startsWith('Portuguese ')), String(signal.missingFacts))
})

test('acquisition searches the language and what is studied about it, not the boilerplate question', () => {
  const query = wholeLanguageSignal().discoveryQuery || ''
  assert.ok(query.startsWith('Portuguese '), query)
  assert.ok(!/verified knowledge|higher confidence/i.test(query), query)
})

test('the rotation actually changes the query across study variants', () => {
  const queries = new Set([0, 1, 2, 3, 4].map(variant => wholeLanguageSignal(variant).discoveryQuery))
  assert.ok(queries.size >= 4, `expected the query to rotate, got ${queries.size} distinct: ${[...queries].join(' | ')}`)
})

test('the gap the cycle sees now carries language study terms, not only boilerplate', () => {
  // The production failure: 733 of 883 Portuguese documents rejected as not relevant, none accepted.
  // Relevance is scored against the gap's subject and question, so the question must name what is
  // actually being studied rather than only "what verified knowledge would let COS handle X".
  const [gap] = generateKnowledgeGaps([wholeLanguageSignal()])
  assert.ok(gap)
  assert.ok(/comprehension|composition/i.test(gap.question), gap.question)
  assert.ok(!/what verified knowledge would let cos handle/i.test(gap.question), gap.question)
  assert.ok((gap.discoveryQuery || '').startsWith('Portuguese '), gap.discoveryQuery)
})

test('a dimension-scoped plan keeps the themes it already had', () => {
  const scoped = platformLanguageStudyGapSignal({
    planKey: 'scoped',
    language: 'pl',
    dimension: 'writing',
    objective: 'restore Polish writing competence',
    strategy: languageStrategy,
  })
  assert.ok(scoped.missingFacts?.every(fact => fact.startsWith('Polish ')), String(scoped.missingFacts))
  assert.ok((scoped.discoveryQuery || '').startsWith('Polish '), scoped.discoveryQuery)
})
