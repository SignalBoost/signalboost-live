import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  RUNPOD_CONTEXT_WINDOW_TOKENS,
  estimateContextTokens,
  planContextWindow,
  resolveContextWindowTokens,
} from '../lib/ai/context-window-manager'

test('uses the RunPod serving-window default and supports deployment overrides', () => {
  assert.equal(resolveContextWindowTokens({ model: 'qwen3:30b', provider: 'runpod', env: {} }), RUNPOD_CONTEXT_WINDOW_TOKENS)
  assert.equal(resolveContextWindowTokens({ model: 'other', provider: 'deepinfra', env: {} }), DEFAULT_CONTEXT_WINDOW_TOKENS)
  assert.equal(resolveContextWindowTokens({ model: 'other', provider: 'deepinfra', env: { LOCAL_AI_CONTEXT_WINDOW_TOKENS: '65536' } }), 65536)
})

test('drops oldest history before shrinking the current user turn', () => {
  const huge = 'x'.repeat(9_000)
  const current = 'CURRENT REQUEST: keep this newest evidence'
  const plan = planContextWindow({
    model: 'qwen',
    contextWindowTokens: 4_096,
    systemPrompt: 'system',
    requestedOutputTokens: 1_024,
    messages: [
      { role: 'user', content: huge },
      { role: 'assistant', content: huge },
      { role: 'user', content: current },
    ],
  })
  assert.equal(plan.messages.at(-1)?.content, current)
  assert.ok(plan.droppedMessages >= 1)
  assert.ok(plan.estimatedPromptTokens + plan.maxOutputTokens <= 4_096)
})

test('compacts a single oversized current turn by retaining both ends', () => {
  const content = `BEGIN-${'x'.repeat(30_000)}-LATEST-DIAGNOSTIC`
  const plan = planContextWindow({
    model: 'qwen',
    contextWindowTokens: 4_096,
    systemPrompt: 'system',
    requestedOutputTokens: 768,
    messages: [{ role: 'user', content }],
  })
  const compacted = String(plan.messages[0].content)
  assert.match(compacted, /^BEGIN-/)
  assert.match(compacted, /LATEST-DIAGNOSTIC$/)
  assert.ok(plan.truncatedCharacters > 0)
  assert.ok(plan.estimatedPromptTokens + plan.maxOutputTokens + 256 <= 4_096)
})

test('fails closed if even the minimum completion cannot fit', () => {
  assert.throws(() => planContextWindow({
    model: 'tiny',
    contextWindowTokens: 1_024,
    systemPrompt: 's'.repeat(2_900),
    requestedOutputTokens: 512,
    minimumOutputTokens: 256,
    messages: [{ role: 'user', content: 'x' }],
  }), /context_window_budget_insufficient/)
})

test('token estimator is conservative and deterministic', () => {
  assert.equal(estimateContextTokens('abcdef'), 2)
  assert.equal(estimateContextTokens('abcdef'), 2)
})
