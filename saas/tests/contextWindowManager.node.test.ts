// saas/tests/contextWindowManager.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ContextWindowBudgetError,
  contextWindowOutputBudget,
  planContextWindowRequest,
  resolveModelContextWindowTokens,
} from '../lib/ai/context-window-manager.ts'

test('known model families get conservative built-in windows while unknown models fail toward an 8k floor', () => {
  assert.equal(resolveModelContextWindowTokens({ model: 'Qwen/Qwen3-30B-A3B', provider: 'runpod' }).contextWindowTokens, 32_768)
  assert.equal(resolveModelContextWindowTokens({ model: 'deepseek-ai/DeepSeek-V4-Flash', provider: 'deepinfra' }).contextWindowTokens, 65_536)
  assert.equal(resolveModelContextWindowTokens({ model: 'unregistered-private-model', provider: 'self_hosted' }).contextWindowTokens, 8_192)
})

test('exact served-model override beats provider and built-in assumptions', () => {
  const previous = process.env.ITMOUNTS_MODEL_CONTEXT_WINDOWS_JSON
  process.env.ITMOUNTS_MODEL_CONTEXT_WINDOWS_JSON = JSON.stringify({
    'runpod:qwen/qwen3-30b-a3b': 48_000,
  })
  try {
    const resolved = resolveModelContextWindowTokens({ model: 'Qwen/Qwen3-30B-A3B', provider: 'runpod' })
    assert.equal(resolved.contextWindowTokens, 48_000)
    assert.equal(resolved.source, 'model_override')
  } finally {
    if (previous === undefined) delete process.env.ITMOUNTS_MODEL_CONTEXT_WINDOWS_JSON
    else process.env.ITMOUNTS_MODEL_CONTEXT_WINDOWS_JSON = previous
  }
})



test('planner preserves complete input by shrinking output before compacting useful context', () => {
  const prompt = 'KEEP-ALL-' + 'p'.repeat(3_000) + '-END'
  const plan = planContextWindowRequest({
    model: 'test-model',
    provider: 'test',
    explicitContextWindowTokens: 2_048,
    systemPrompt: 'trusted host policy',
    prompt,
    requestedOutputTokens: 1_500,
    safetyTokens: 64,
  })
  assert.equal(plan.prompt, prompt)
  assert.equal(plan.estimatedInputTokensAfter, plan.estimatedInputTokensBefore)
  assert.ok(plan.maxOutputTokens < 1_500)
  assert.ok(plan.maxOutputTokens >= 256)
  assert.equal(plan.compacted, true)
})

test('oversized single prompts are deterministically middle-compacted while preserving the request edges and output budget', () => {
  const prompt = `BEGIN-REQUEST\n${'x'.repeat(12_000)}\nLATEST-DIAGNOSTIC-END`
  const plan = planContextWindowRequest({
    model: 'test-model',
    provider: 'test',
    explicitContextWindowTokens: 2_048,
    systemPrompt: 'trusted host policy',
    prompt,
    requestedOutputTokens: 512,
    safetyTokens: 64,
  })
  assert.equal(plan.maxOutputTokens, 512)
  assert.equal(plan.compacted, true)
  assert.ok(plan.prompt.startsWith('BEGIN-REQUEST'))
  assert.ok(plan.prompt.endsWith('LATEST-DIAGNOSTIC-END'))
  assert.match(plan.prompt, /context omitted by iTMounts context-window manager/)
  assert.ok(plan.estimatedInputTokensAfter < plan.estimatedInputTokensBefore)
})

test('message history drops oldest turns first and always keeps the newest request', () => {
  const plan = planContextWindowRequest({
    model: 'test-model',
    provider: 'test',
    explicitContextWindowTokens: 2_048,
    systemPrompt: 'trusted host policy',
    requestedOutputTokens: 512,
    safetyTokens: 64,
    messages: [
      { role: 'user', content: 'old-user-' + 'a'.repeat(3_200) },
      { role: 'assistant', content: 'old-assistant-' + 'b'.repeat(3_200) },
      { role: 'user', content: 'CURRENT REQUEST MUST SURVIVE' },
    ],
  })
  assert.equal(plan.messages?.at(-1)?.content, 'CURRENT REQUEST MUST SURVIVE')
  assert.ok(plan.droppedMessageCount >= 1)
  assert.equal(plan.compacted, true)
})

test('a newest tool exchange is compacted as an atomic protocol group instead of orphaning tool results', () => {
  const plan = planContextWindowRequest({
    model: 'test-model',
    provider: 'test',
    explicitContextWindowTokens: 2_048,
    systemPrompt: 'trusted host policy',
    requestedOutputTokens: 256,
    safetyTokens: 64,
    messages: [
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'inspect', arguments: '{"path":"large"}' } }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'TOOL-START ' + 'z'.repeat(8_000) + ' TOOL-END' },
    ],
  })
  assert.equal(plan.messages?.length, 2)
  assert.equal(plan.messages?.[0]?.role, 'assistant')
  assert.equal(plan.messages?.[1]?.role, 'tool')
  assert.equal(plan.messages?.[1]?.tool_call_id, 'call_1')
  assert.equal(plan.compacted, true)
})

test('trusted system/tool contracts fail closed when they cannot leave minimum input and output headroom', () => {
  assert.throws(
    () => planContextWindowRequest({
      model: 'test-model',
      provider: 'test',
      explicitContextWindowTokens: 1_024,
      systemPrompt: 's'.repeat(4_000),
      prompt: 'question',
      requestedOutputTokens: 256,
      safetyTokens: 64,
    }),
    (error: unknown) => error instanceof ContextWindowBudgetError,
  )
})

test('shared output-budget primitive supports fixed-window evaluators without changing their prompt math', () => {
  const system = 'system'
  const prompt = 'x'.repeat(18_000)
  const budget = contextWindowOutputBudget({
    contextWindowTokens: 8_192,
    systemPrompt: system,
    prompt,
    requestedOutputTokens: 1_024,
    minOutputTokens: 256,
    estimatedCharsPerToken: 3,
    fixedOverheadTokens: 128,
  })
  assert.equal(budget.estimatedPromptTokens, Math.ceil((system.length + prompt.length) / 3) + 128)
  assert.equal(budget.maxOutputTokens, 1_024)
})

test('the real local inference transport is wired through the universal planner and uses the planned payload', () => {
  const source = readFileSync(new URL('../lib/ai/local-inference.ts', import.meta.url), 'utf8')
  assert.match(source, /planContextWindowRequest\(/)
  assert.match(source, /requestedMaxTokens = contextPlan\.maxOutputTokens/)
  assert.match(source, /content: contextPlan\.prompt/)
  assert.match(source, /contextPlan\.messages/)
  assert.match(source, /emitContextWindowTelemetry\(contextPlan/)
})


test('hosted University faculty also pass through the universal context planner before paid dispatch', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityTeacherAdapters.ts', import.meta.url), 'utf8')
  assert.match(source, /planContextWindowRequest\(/)
  assert.match(source, /prompt: contextPlan\.prompt/)
  assert.match(source, /maxOutputTokens: contextPlan\.maxOutputTokens/)
  assert.match(source, /emitContextWindowTelemetry\(contextPlan, `university_teacher_/)
})
