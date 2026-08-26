// saas/tests/cognitiveReasoningImperativeTriggers.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectCognitiveReasoningTriggers } from '../lib/ai/cos/cognitiveReasoningPatterns.ts'

const kinds = (prompt: string) => detectCognitiveReasoningTriggers(prompt).map(trigger => trigger.kind)

test('an imperative brief can now produce triggers at all', () => {
  // Before this fix the gate required a '?' or a leading interrogative, so every enterprise brief
  // returned zero triggers and no procedural skill could ever be selected. The cognitive-skills
  // funnel read "1 retrieved -> 0 relevant" on every technical turn for days as a result.
  assert.deepEqual(kinds('Compare the two providers and recommend which is better.'), ['underspecified_comparison'])
})

test('a scenario that ends in a question is evaluated on its final clause', () => {
  // The referent pattern is anchored to the start of the text, so a brief that opens with context
  // and closes with the operative question was previously invisible to it.
  assert.ok(
    kinds('Two alerts fired in the same minute. Should these be treated as one incident?')
      .includes('unresolved_referent_followup'),
  )
})

test('short interrogatives keep working exactly as before', () => {
  assert.deepEqual(
    kinds('Is it safe here?').sort(),
    ['deictic_predicate_question', 'unresolved_referent_followup'],
  )
  assert.deepEqual(kinds('When did she leave?'), ['unresolved_referent_followup'])
})

test('an unambiguous imperative does NOT fire', () => {
  // Widening the gate must not make an ambiguity procedure eligible for every request. These are
  // fully specified: nothing needs resolving before answering.
  for (const prompt of [
    'Write a haiku about autumn.',
    'Calculate 512 multiplied by 10.2 kilowatts per node.',
    'Explain how photosynthesis works.',
    'During a scheduled generator test, GEN-2 did not start. Give the leading hypotheses.',
  ]) {
    assert.deepEqual(kinds(prompt), [], prompt)
  }
})

test('a pronoun with a stated antecedent is not treated as unresolved', () => {
  // "them" here refers to the two warnings named in the same prompt. Firing on any mid-sentence
  // pronoun would make the trigger meaningless.
  assert.deepEqual(
    kinds('A CRAC fan warning and a PDU branch-load warning occurred together. Should COS collapse them into one incident?'),
    [],
  )
})

test('non-requests are still ignored entirely', () => {
  for (const prompt of ['', '   ', 'The rack draws 10 kW.', 'Thanks, that helps.']) {
    assert.deepEqual(kinds(prompt), [], JSON.stringify(prompt))
  }
})

test('trigger kinds are deduplicated', () => {
  const result = detectCognitiveReasoningTriggers('Is it better here? Is it better here?')
  assert.equal(new Set(result.map(t => t.kind)).size, result.length)
})
