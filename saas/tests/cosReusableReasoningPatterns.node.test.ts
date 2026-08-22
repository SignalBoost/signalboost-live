import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cognitiveSkillReasoningTriggerKinds,
  detectCognitiveReasoningTriggers,
  matchingCognitiveReasoningTriggers,
} from '../lib/ai/cos/cognitiveReasoningPatterns.ts'

function kinds(prompt: string): string[] {
  return detectCognitiveReasoningTriggers(prompt).map(trigger => trigger.kind)
}

test('deictic predicate trigger generalizes beyond a hard-coded adjective list', () => {
  assert.ok(kinds('Is it cold here?').includes('deictic_predicate_question'))
  assert.ok(kinds('Is it safe here?').includes('deictic_predicate_question'))
  assert.ok(kinds('Is it crowded nearby?').includes('deictic_predicate_question'))
  assert.ok(kinds('Is it glorp here?').includes('deictic_predicate_question'))
  assert.ok(kinds('Is it raining here?').includes('deictic_predicate_question'))
})

test('other ambiguity structures are detected independently of topic', () => {
  assert.ok(kinds('When did she leave?').includes('unresolved_referent_followup'))
  assert.ok(kinds('Which one is better?').includes('underspecified_comparison'))
  assert.ok(kinds('Will it happen soon?').includes('vague_temporal_reference'))
  assert.deepEqual(kinds('Is Paris in France?'), [])
})

test('skills opt into bounded trigger kinds through stored procedure or metadata', () => {
  const configured = cognitiveSkillReasoningTriggerKinds({
    procedure: { reasoningTriggers: ['deictic_predicate_question', 'not_a_real_trigger'] },
    metadata: { reasoningTriggers: ['underspecified_comparison'] },
  })
  assert.deepEqual(configured.sort(), ['deictic_predicate_question', 'underspecified_comparison'])

  const detected = detectCognitiveReasoningTriggers('Is it quieter here?')
  assert.deepEqual(matchingCognitiveReasoningTriggers(detected, configured), ['deictic_predicate_question'])
})
