import assert from 'node:assert/strict'
import test from 'node:test'
import { detectStuck, stuckNudge, type LoopStep } from '../lib/ai/cos/agentLoop/openhandsPatterns.ts'

function step(action: string, observation: string, error = false): LoopStep {
  return { action, observation, error }
}

test('different actions with an identical observation terminate as evidence stagnation', () => {
  const steps = [
    step('web_search:{"q":"alpha"}', 'No evidence returned'),
    step('web_search:{"q":"beta"}', 'No evidence returned'),
    step('web_fetch:{"url":"example"}', 'No evidence returned'),
    step('web_search:{"q":"gamma"}', 'No evidence returned'),
  ]
  const stuck = detectStuck(steps)
  assert.deepEqual(stuck, { pattern: 'observation_stagnation', repetitions: 4 })
  assert.match(stuckNudge(stuck!), /identical observations without new evidence/)
})

test('genuinely new observations permit continuation', () => {
  const steps = [
    step('web_search:a', 'No evidence returned'),
    step('web_search:b', 'No evidence returned'),
    step('web_search:c', 'Found one source'),
    step('web_fetch:d', 'No evidence returned'),
  ]
  assert.equal(detectStuck(steps), null)
})

test('identical action/observation retains the existing more-specific stuck outcome', () => {
  const steps = Array.from({ length: 4 }, () => step('web_search:one', 'No results'))
  assert.deepEqual(detectStuck(steps), { pattern: 'action_observation_loop', repetitions: 4 })
})

test('different useful observations do not trigger stagnation even with repeated tools', () => {
  const steps = ['A', 'B', 'C', 'D'].map((observation, index) => step('web_search:' + index, observation))
  assert.equal(detectStuck(steps), null)
})
