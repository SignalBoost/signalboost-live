import assert from 'node:assert/strict'
import test from 'node:test'
import {
  gapStudyTerms,
  minimumRelevance,
  minimumTermMatches,
  relevanceOf,
  sourceAwareRelevant,
} from '../lib/cos-core/layers/learning/cycle.ts'
import { learningDiscoveryQuery } from '../lib/cos-core/layers/learning/connectors.ts'
import { generateKnowledgeGaps } from '../lib/cos-core/layers/learning/gaps.ts'
import {
  selectCosUniversityStudyStrategy,
  universityStudyGapSignal,
} from '../lib/ai/cos/cosUniversityStudyStrategy.ts'

function physicsGap() {
  const signal = universityStudyGapSignal({
    planKey: 'physics-remediation-plan',
    subjectId: 'physics_natural_sciences',
    objective: 'Remediate the weakness demonstrated by a fresh independent unseen Physics & Natural Sciences examination, then prove improvement.',
    failureClass: 'unknown',
    strategy: selectCosUniversityStudyStrategy({ failureClass: 'unknown' }),
  })
  const [gap] = generateKnowledgeGaps([signal])
  assert.ok(gap)
  return { signal, gap }
}

test('University study gaps carry host-owned curriculum focus instead of relying on remediation prose', () => {
  const { signal, gap } = physicsGap()
  assert.ok(signal.focusTerms?.includes('physics and mechanics'))
  assert.ok(signal.focusTerms?.includes('scientific method'))
  assert.ok(gap.focusTerms?.includes('physics and mechanics'))

  const terms = gapStudyTerms(gap)
  assert.ok(terms.supporting.includes('mechanics'))
  assert.ok(terms.supporting.includes('scientific'))
  assert.ok(!terms.supporting.includes('weakness'))
})

test('academic discovery uses canonical subject focus rather than generic confidence/remediation wording', () => {
  const { gap } = physicsGap()
  const query = learningDiscoveryQuery(gap)
  assert.match(query, /Physics & Natural Sciences/i)
  assert.match(query, /physics and mechanics/i)
  assert.match(query, /scientific method/i)
  assert.doesNotMatch(query, /higher confidence/i)
  assert.doesNotMatch(query, /remediate the weakness/i)
})

test('a substantive scholarly document matching the academic domain clears relevance without lowering the global floor', () => {
  const { gap } = physicsGap()
  const terms = gapStudyTerms(gap)
  const document = {
    sourceKind: 'scientific_journal' as const,
    sourceUri: 'https://example.test/physics-mechanics',
    sourceTitle: 'Experimental Physics and Mechanics',
    subject: gap.subject,
    text: 'Physics experiments use mechanics, measurement, energy, and the scientific method to test physical models against reproducible observations. '.repeat(8),
  }
  const score = relevanceOf(document, terms)
  assert.ok(score.coverage >= minimumRelevance())
  assert.equal(sourceAwareRelevant(document, score, terms, minimumRelevance(), minimumTermMatches()), true)
  assert.equal(minimumRelevance(), 0.12)
})
