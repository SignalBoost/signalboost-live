import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interactiveRunpodMaxTokens } from '../lib/ai/local-inference.ts'

test('short helper calls retain the existing default 1000-token cap', () => {
  assert.equal(interactiveRunpodMaxTokens(1400), 1000)
  assert.equal(interactiveRunpodMaxTokens(700), 700)
})
test('the answer the user reads can use its full requested output budget', () => {
  assert.equal(interactiveRunpodMaxTokens(3500, true), 3500)
  assert.equal(interactiveRunpodMaxTokens(8000, true), 4000)
  assert.equal(interactiveRunpodMaxTokens(1400, true), 1400)
})
test('a low helper-call configuration does not truncate the user answer', () => {
  const old = process.env.COS_INTERACTIVE_RUNPOD_MAX_TOKENS
  try {
    process.env.COS_INTERACTIVE_RUNPOD_MAX_TOKENS = '800'
    assert.equal(interactiveRunpodMaxTokens(3500), 800)
    assert.equal(interactiveRunpodMaxTokens(3500, true), 3500)
  } finally {
    if (old === undefined) delete process.env.COS_INTERACTIVE_RUNPOD_MAX_TOKENS
    else process.env.COS_INTERACTIVE_RUNPOD_MAX_TOKENS = old
  }
})
test('actual RunPod interactive call propagates the user-answer flag into its token cap', () => {
  const src = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url),'utf8')
  assert.match(src, /interactiveRunpodMaxTokens\(args\.maxTokens, args\.writesUserAnswer === true\)/)
})
