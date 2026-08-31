import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildCascadePlan, cascadeTopicAffinity, validateCascadeCandidate } from '../lib/ai/cos/cascadeContract.ts'

test('no chip renders without topic affinity, an executable answer path, and provenance strategy', () => {
  const root = 'What specific factors contribute to the difference between the uncontrolled and controlled gender pay gap?'
  const candidate = validateCascadeCandidate({
    rootQuestion: root,
    question: 'What does the controlled gender pay gap comparison leave unmeasured?',
    sourceTitles: ['BLS earnings data', 'Census earnings data'],
  })
  assert.equal(candidate.status, 'validated')
  assert.ok(candidate.topic_affinity.score >= candidate.topic_affinity.threshold)
  assert.deepEqual(candidate.answer_path.query_plan.map(step => step.step), [
    'semantic_expand', 'source_selection', 'evidence_retrieval', 'answer_synthesis',
  ])
  assert.equal(candidate.provenance_strategy.must_be_root_topic_relevant, true)
  assert.ok(candidate.provenance_strategy.min_sources >= 1)
})

test('gender pay gap cannot drift into medical trials or generic validation', () => {
  const root = 'What specific factors contribute to the difference between the uncontrolled and controlled gender pay gap?'
  for (const question of [
    'What does empirical research mean in medicine?',
    'Which validation framework is used for agent-based simulations?',
    'What does LIVE2 say about randomized controlled trials?',
  ]) {
    const candidate = validateCascadeCandidate({ rootQuestion: root, question })
    assert.equal(candidate.status, 'rejected', question)
    assert.equal(candidate.rejection_reason, 'root_topic_affinity_failed', question)
  }
})

test('source-less chips get a real retrieval plan rather than pretending a source already exists', () => {
  const candidate = validateCascadeCandidate({
    rootQuestion: "Should men play in women's sport?",
    question: "What eligibility rules govern participation in women's sport?",
    sourceTitles: [],
  })
  assert.equal(candidate.status, 'validated')
  assert.equal(candidate.answerability, 'retrievable_source')
  assert.deepEqual(candidate.provenance_strategy.expected_sources, ['live_external_retrieval'])
  assert.equal(candidate.answer_path.type, 'rag_query')
})

test('only validated candidates become rendered chips', () => {
  const plan = buildCascadePlan({
    rootQuestion: 'What is the gender pay gap in the US?',
    questions: [
      'What does the gender pay gap measure?',
      'What does the gender pay gap leave uncontrolled?',
      'What does empirical medicine mean?',
    ],
    sourceTitles: ['BLS', 'Census'],
  })
  assert.equal(plan.candidates.length, 2)
  assert.ok(plan.candidates.every(candidate => candidate.status === 'rendered'))
  assert.ok(plan.candidates.every(candidate => candidate.root_question === 'What is the gender pay gap in the US?'))
})

test('affinity is measured against the root topic rather than the last failed chip', () => {
  const root = 'What is the gender pay gap in the US?'
  const good = cascadeTopicAffinity(root, 'What factors affect the gender pay gap?')
  const drift = cascadeTopicAffinity(root, 'What does LIVE2 define empirical research as?')
  assert.ok(good.score >= good.threshold)
  assert.ok(drift.score < drift.threshold)
})

test('runtime wiring persists cascade lineage and reuses it only for clicked rendered chips', () => {
  const followups = readFileSync(new URL('../lib/ai/cos/suggestedFollowups.ts', import.meta.url), 'utf8')
  const persistence = readFileSync(new URL('../lib/ai/cos/cascadePersistence.ts', import.meta.url), 'utf8')
  assert.match(followups, /cascadeRootForClickedFollowup/)
  assert.match(followups, /attachCascadePlanToStoredTurn/)
  assert.match(persistence, /candidates\.some\(\(candidate: any\) => sameQuestion\(candidate\?\.question, currentPrompt\)\)/)
  assert.match(persistence, /cascade: normalizedPlan/)
})
