// saas/tests/cosUniversityMassEvaluationContextBudget.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MASS_EVALUATION_MODEL_CONTEXT_TOKENS, massEvaluationOutputTokens } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

test('the recorded Production overflow now fits the 8192-token window', () => {
  // 8 cases whose prompt tokenized to at least 4833 tokens; use a character length at the upper end for Qwen (~4 chars/token).
  const prompt = 'x'.repeat(4833 * 4)
  const maxTokens = massEvaluationOutputTokens(8, prompt)
  assert.ok(maxTokens < 3360, 'must request less than the output that overflowed')
  assert.ok(4833 + maxTokens <= MASS_EVALUATION_MODEL_CONTEXT_TOKENS, 'actual prompt plus output stays inside the window')
  assert.ok(maxTokens >= 8 * 120, 'still leaves a usable answer budget per case')
})

test('short batches keep the previous budget and never exceed 4096 output tokens', () => {
  assert.equal(massEvaluationOutputTokens(2, 'short prompt'), 1024)
  assert.equal(massEvaluationOutputTokens(8, 'x'.repeat(3000)), 3360)
  assert.ok(massEvaluationOutputTokens(12, 'x'.repeat(3000)) <= 4096)
})

test('the 2026-09-16 batch refused at an estimated 9138 prompt tokens now fits with a usable budget', () => {
  // 17:23 and 17:32 UTC: the refused batch was (9138 - 128) * 3 = 27030 characters including the system prompt.
  const prompt = 'x'.repeat(27030 - 'You are being evaluated on final-answer quality only. Do not provide hidden chain-of-thought.'.length)
  const maxTokens = massEvaluationOutputTokens(8, prompt)
  assert.ok(maxTokens >= 8 * 120, 'leaves a usable answer budget per case')
  assert.ok(4833 + maxTokens <= MASS_EVALUATION_MODEL_CONTEXT_TOKENS, 'the provider-measured prompt plus output stays inside the window')
})

test('a batch that cannot fit a usable answer fails with an explicit reason instead of a provider 400', () => {
  assert.throws(() => massEvaluationOutputTokens(8, 'x'.repeat(30000)), /mass_distilled_evaluation_context_budget_insufficient:cases=8:estimatedPromptTokens=\d+/)
})

test('the RunPod call uses the fitted budget and still makes exactly one request per suite and model', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
  assert.match(source, /max_tokens:massEvaluationOutputTokens\(input\.cases\.length,userPrompt\),messages:\[\{role:'system',content:MASS_EVALUATION_SYSTEM_PROMPT\}/)
  assert.doesNotMatch(source, /max_tokens:Math\.min\(4096,Math\.max\(1024,input\.cases\.length\*420\)\)/)
  assert.equal((source.match(/\/chat\/completions`/g) || []).length, 1)
})
