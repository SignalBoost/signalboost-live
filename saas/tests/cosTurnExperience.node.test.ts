import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TurnRecorder,
  extractQueryFeatures,
  surfaceDifficulty,
} from '../lib/ai/cos/turnExperience.ts'

function fakeClock(steps: number[]): () => number {
  let index = 0
  let value = 1_000
  return () => {
    const current = value
    value += steps[index] ?? 0
    index += 1
    return current
  }
}

test('a lookup question and a hard engineering question score differently', () => {
  const lookup = extractQueryFeatures('What is a semantic cache?')
  assert.equal(lookup.isLookup, true)
  assert.equal(surfaceDifficulty(lookup), 'easy')

  const hard = extractQueryFeatures(
    'Enterprise-tenant p95 latency triples while database CPU is normal and no deployment occurred. ' +
    'Compare the likely architectural causes and explain how you would distinguish between them ' +
    'without changing anything in production, given that connection pooling is shared.',
  )
  assert.equal(hard.hasComparison, true)
  assert.equal(hard.hasMultiHop, true)
  assert.equal(surfaceDifficulty(hard), 'hard')
})

test('code and math markers are detected', () => {
  assert.equal(extractQueryFeatures('write a program that uses import os').hasCode, true)
  assert.equal(extractQueryFeatures('calculate the p95 from these values').hasMath, true)
})

test('feature extraction never throws on degenerate input', () => {
  for (const input of ['', '   ', '?????', '\n\n'] as string[]) {
    const features = extractQueryFeatures(input)
    assert.equal(typeof features.wordCount, 'number')
    assert.equal(typeof features.avgWordLength, 'number')
    assert.ok(Number.isFinite(features.avgWordLength))
  }
})

test('phase durations and direct-model accounting are measured, not guessed', async () => {
  const recorder = new TurnRecorder(fakeClock([0, 500, 0, 400, 200]))
  await recorder.time('draft', async () => 'answer', 'model')
  await recorder.time('quality_repair', async () => 'better answer', 'model')
  const snapshot = recorder.snapshot({
    turnId: '00000000-0000-4000-8000-000000000001',
    promptHash: 'h',
    features: extractQueryFeatures('x'),
    reasonerLabel: 'r',
    answered: true,
  })

  assert.equal(snapshot.phases.length, 2)
  assert.equal(snapshot.modelCalls, 2)
  assert.equal(snapshot.modelCallMs, snapshot.phases.reduce((sum, phase) => sum + phase.ms, 0))
  assert.equal(snapshot.otherMs, Math.max(0, snapshot.totalMs - snapshot.modelCallMs))
})

test('orchestration phases are not falsely counted as one provider request', async () => {
  const recorder = new TurnRecorder(fakeClock([0, 250, 0, 100, 50]))
  await recorder.time('council', async () => ({ advisory: 'x' }))
  await recorder.time('draft', async () => 'answer', 'model')
  const snapshot = recorder.snapshot({
    turnId: '00000000-0000-4000-8000-000000000002',
    promptHash: 'h',
    features: extractQueryFeatures('x'),
    reasonerLabel: 'r',
    answered: true,
  })

  assert.equal(snapshot.phases[0].kind, 'orchestration')
  assert.equal(snapshot.modelCalls, 1)
})

test('skips are recorded with reasons — the counterfactual half of the record', () => {
  const recorder = new TurnRecorder()
  recorder.skip('council', 'not_eligible')
  recorder.skip('quality_repair', 'not_needed')
  recorder.skip('skill_citation_repair', 'no_budget')
  const snapshot = recorder.snapshot({
    turnId: '00000000-0000-4000-8000-000000000003',
    promptHash: 'h',
    features: extractQueryFeatures('x'),
    reasonerLabel: 'r',
    answered: true,
  })

  assert.deepEqual(snapshot.skipped.map(entry => entry.reason).sort(), ['no_budget', 'not_eligible', 'not_needed'])
  assert.ok(snapshot.skipped.every(entry => entry.phase.length > 0))
})

test('a phase that returns nothing is recorded as ran-but-not-ok, not skipped', async () => {
  const recorder = new TurnRecorder()
  await recorder.time('council', async () => null)
  const snapshot = recorder.snapshot({
    turnId: '00000000-0000-4000-8000-000000000004',
    promptHash: 'h',
    features: extractQueryFeatures('x'),
    reasonerLabel: 'r',
    answered: true,
  })
  assert.equal(snapshot.phases.length, 1)
  assert.equal(snapshot.phases[0].ok, false)
  assert.equal(snapshot.skipped.length, 0)
})

test('a throwing phase is still timed, then rethrown', async () => {
  const recorder = new TurnRecorder()
  await assert.rejects(() => recorder.time('draft', async () => { throw new Error('endpoint refused') }, 'model'), /endpoint refused/)
  const snapshot = recorder.snapshot({
    turnId: '00000000-0000-4000-8000-000000000005',
    promptHash: 'h',
    features: extractQueryFeatures('x'),
    reasonerLabel: 'r',
    answered: false,
  })
  assert.equal(snapshot.phases.length, 1)
  assert.equal(snapshot.phases[0].ok, false)
})

test('the record carries no prompt text — only features and a hash', () => {
  const prompt = 'A very identifying question about ACME Corp revenue in Q3'
  const recorder = new TurnRecorder()
  const snapshot = recorder.snapshot({
    turnId: '00000000-0000-4000-8000-000000000006',
    promptHash: 'abc123',
    features: extractQueryFeatures(prompt),
    reasonerLabel: 'r',
    answered: true,
  })
  const serialized = JSON.stringify(snapshot)
  assert.ok(!serialized.includes('ACME'))
  assert.ok(!serialized.includes('revenue'))
  assert.match(serialized, /abc123/)
})
