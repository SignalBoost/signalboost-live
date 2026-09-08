import assert from 'node:assert/strict'
import test from 'node:test'
import {
  gapStudyTerms,
  minimumRelevance,
  minimumTermMatches,
  relevanceOf,
  sourceAwareRelevant,
} from '../lib/cos-core/layers/learning/cycle.ts'
import { SearchLearningConnector } from '../lib/cos-core/layers/learning/connectors.ts'
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

test('University study gaps put host-owned curriculum themes before remediation prose', () => {
  const { signal, gap } = physicsGap()
  assert.ok(signal.missingFacts?.includes('physics and mechanics'))
  assert.ok(signal.missingFacts?.includes('scientific method'))
  assert.match(gap.question, /^physics and mechanics; chemistry and biology fundamentals; scientific method;/i)

  const terms = gapStudyTerms(gap)
  assert.ok(terms.supporting.includes('mechanics'))
  assert.ok(terms.supporting.includes('scientific'))
  assert.ok(!terms.supporting.includes('weakness'))
})

test('bounded scholarly discovery sees canonical curriculum content before generic remediation wording', async () => {
  const { gap } = physicsGap()
  let query = ''
  const connector = new SearchLearningConnector('scientific_journal', async value => {
    query = value
    return []
  }, 2, 'academic_focus_probe')
  await connector.acquire(gap)
  const boundedPrefix = query.split(/\s+/).filter(Boolean).slice(0, 10).join(' ')
  assert.match(query, /Physics & Natural Sciences/i)
  assert.match(boundedPrefix, /physics and mechanics/i)
  assert.match(query, /scientific method/i)
  assert.doesNotMatch(boundedPrefix, /verified knowledge/i)
  assert.doesNotMatch(boundedPrefix, /higher confidence/i)
})

test('substantive scholarly Physics material clears relevance without lowering the global floor', () => {
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
