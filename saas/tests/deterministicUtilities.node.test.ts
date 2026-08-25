import assert from 'node:assert/strict'
import test from 'node:test'
import { tryDeterministicUtility } from '../lib/ai/cos/deterministicUtilities.ts'

function run(prompt: string, timezone = 'America/New_York') {
  return tryDeterministicUtility({ prompt, timezone, locale: 'en-US', confidenceThreshold: 0.72 })
}

test('handles typoed current-time question without a model', () => {
  const result = run('what time is is?')
  assert.ok(result)
  assert.equal(result.source, 'deterministic-current-time')
  assert.equal(result.confidence, 1)
  assert.equal(result.executionProvenance.local_reasoning.invoked, false)
  assert.equal(result.executionProvenance.external_ai.invoked, false)
})

test('handles colloquial current-date question without a model', () => {
  const result = run('what date today?')
  assert.ok(result)
  assert.equal(result.source, 'deterministic-current-date')
  assert.match(result.reply, /^Today is /)
})

test('handles combined date time and season request in one deterministic pass', () => {
  const result = run('give me current date and time and season of the year')
  assert.ok(result)
  assert.equal(result.source, 'deterministic-current-datetime-season')
  assert.match(result.reply, /The current season is /)
  assert.equal(result.executionProvenance.model_generated, false)
})

test('season flips for a southern-hemisphere timezone', () => {
  const north = run('what is the current season?', 'America/New_York')
  const south = run('what is the current season?', 'Australia/Sydney')
  assert.ok(north)
  assert.ok(south)
  assert.notEqual(north.reply, south.reply)
})

test('answers the approved public SignalBoost identity without COS availability', () => {
  const result = run('what is SignalBoost and who own it?')
  assert.ok(result)
  assert.equal(result.source, 'deterministic-signalboost-identity')
  assert.match(result.reply, /privately owned U\.S\. AI platform/)
  assert.match(result.reply, /English, Spanish, Portuguese, Polish, and Russian/)
  assert.equal(result.executionProvenance.model_generated, false)
})
