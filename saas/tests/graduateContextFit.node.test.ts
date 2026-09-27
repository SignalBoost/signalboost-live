// saas/tests/graduateContextFit.node.test.ts
//
// 2026-09-27 19:29 ET: the only active graduate (mass:481a6760, vLLM --max-model-len 8192) failed a live verifier
// call in 6 ms with `context_window_budget_insufficient` — the COS worker request (sized for the 32k+ managed
// reasoner) never fit its window, so none of its 66 live calls ever reached RunPod. Graduate calls are now fitted
// to the graduate's window first.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fitGraduateCall } from '../lib/ai/cos/graduateContextFit.ts'
import { planContextWindow, estimateContextTokens } from '../lib/ai/context-window-manager.ts'
import { COS_GENERAL_REASONING_DISCIPLINE } from '../lib/ai/cos/cosGeneralReasoningDiscipline.ts'

const model = 'itmounts-mass-distilled-9c350ca1fac4-db505a42e0'
const env = {} as NodeJS.ProcessEnv

// A realistic oversized COS worker request: interactive system prompt + general discipline + role guidance.
const bigSystem = [
  'COS INTERACTIVE SYSTEM PROMPT. '.repeat(600),
  COS_GENERAL_REASONING_DISCIPLINE,
  'COS SPECIALIST ROLE: VERIFIER. Return the verdict JSON exactly as specified.',
].join('\n\n')
const question = 'Compare the trade-offs of scaling our RunPod GPUs versus adding DeepInfra capacity. '.repeat(20)

test('the unfitted request really does not fit an 8k RunPod graduate (the Production failure)', () => {
  assert.throws(() => planContextWindow({
    model, provider: 'runpod', env, systemPrompt: bigSystem,
    messages: [{ role: 'user', content: question }], requestedOutputTokens: 2400, minimumOutputTokens: 256,
  }), /context_window_budget_insufficient/)
})

test('the fitted request fits the same window and keeps the requested verdict budget', () => {
  const fitted = fitGraduateCall({ model, provider: 'runpod', systemPrompt: bigSystem, prompt: question, maxTokens: 2400 })
  assert.equal(fitted.contextWindowTokens, 8192)
  assert.equal(fitted.maxTokens, 2048)
  assert.ok(fitted.systemCompactedCharacters > 0)
  const plan = planContextWindow({
    model, provider: 'runpod', env, systemPrompt: fitted.systemPrompt,
    messages: [{ role: 'user', content: question }], requestedOutputTokens: fitted.maxTokens, minimumOutputTokens: 256,
  })
  assert.ok(plan.maxOutputTokens >= 256)
  assert.equal(plan.truncatedCharacters, 0, 'the question the graduate judges is kept intact')
})

test('compaction keeps the beginning and the role/output contract at the end', () => {
  const fitted = fitGraduateCall({ model, provider: 'runpod', systemPrompt: bigSystem, prompt: question, maxTokens: 2400 })
  assert.ok(fitted.systemPrompt!.startsWith('COS INTERACTIVE SYSTEM PROMPT.'))
  assert.ok(fitted.systemPrompt!.endsWith('Return the verdict JSON exactly as specified.'))
  assert.match(fitted.systemPrompt!, /COS instructions compacted to fit the graduate context window/)
})

test('a request that already fits is passed through unchanged', () => {
  const fitted = fitGraduateCall({ model, provider: 'runpod', systemPrompt: 'Short system prompt.', prompt: 'Short question?', maxTokens: 600 })
  assert.equal(fitted.systemPrompt, 'Short system prompt.')
  assert.equal(fitted.maxTokens, 600)
  assert.equal(fitted.systemCompactedCharacters, 0)
})

test('a very long user message still leaves the system prompt a share of the window', () => {
  const fitted = fitGraduateCall({ model, provider: 'runpod', systemPrompt: bigSystem, prompt: 'x'.repeat(60_000), maxTokens: 4200 })
  assert.ok(estimateContextTokens(fitted.systemPrompt) > 1000)
  const plan = planContextWindow({
    model, provider: 'runpod', env, systemPrompt: fitted.systemPrompt,
    messages: [{ role: 'user', content: 'x'.repeat(60_000) }], requestedOutputTokens: fitted.maxTokens, minimumOutputTokens: 256,
  })
  assert.ok(plan.maxOutputTokens >= 256)
})

test('only the graduate worker is fitted; the managed reasoner path is unchanged', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  const graduate = source.slice(source.indexOf('function createGraduateWorker'), source.indexOf('function baseOpenModelWorkers'))
  assert.match(graduate, /fitGraduateCall\(/)
  assert.match(graduate, /maxTokens: fitted\.maxTokens/)
  assert.equal(source.split('fitGraduateCall(').length - 1, 1)
})
