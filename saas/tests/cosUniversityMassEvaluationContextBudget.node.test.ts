// saas/tests/cosUniversityMassEvaluationContextBudget.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MASS_EVALUATION_MAX_OUTPUT_TOKENS, MASS_EVALUATION_MODEL_CONTEXT_TOKENS, MASS_EVALUATION_SYSTEM_PROMPT, massEvaluationOutputTokens, planMassEvaluationGroups } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

test('the conservative 3 characters per token estimate is kept after the 4 per token calibration was disproven', () => {
  const prompt = 'x'.repeat(27030 - MASS_EVALUATION_SYSTEM_PROMPT.length)
  assert.throws(() => massEvaluationOutputTokens(8, prompt), /mass_distilled_evaluation_context_budget_insufficient:cases=8:estimatedPromptTokens=9138/)
})

test('all evaluator generations are bounded to 1024 output tokens while solo split children get full marker headroom', () => {
  assert.equal(MASS_EVALUATION_MAX_OUTPUT_TOKENS, 1024)
  assert.equal(massEvaluationOutputTokens(1, 'short prompt'), 1024)
  assert.equal(massEvaluationOutputTokens(2, 'short prompt'), 768)
  assert.equal(massEvaluationOutputTokens(4, 'short prompt'), 768)
  assert.equal(massEvaluationOutputTokens(8, 'x'.repeat(3000)), 1024)
  assert.equal(massEvaluationOutputTokens(12, 'x'.repeat(3000)), 1024)
  assert.ok(massEvaluationOutputTokens(12, 'x'.repeat(3000)) <= MASS_EVALUATION_MAX_OUTPUT_TOKENS)
})

test('the recorded 8-case holdout is split into requests that each fit the window with a usable answer budget', () => {
  const cases = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, text: 'x'.repeat(3350) }))
  const promptFor = (group: readonly { text: string }[]) => group.map(item => item.text).join('\n')
  const groups = planMassEvaluationGroups(cases, promptFor, 3)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.flat().map(item => item.id), cases.map(item => item.id), 'order and content preserved')
  for (const group of groups) {
    const prompt = promptFor(group)
    const output = massEvaluationOutputTokens(group.length, prompt)
    const estimatedPrompt = Math.ceil((MASS_EVALUATION_SYSTEM_PROMPT.length + prompt.length) / 3) + 128
    assert.ok(estimatedPrompt + output <= MASS_EVALUATION_MODEL_CONTEXT_TOKENS)
    assert.ok(output >= group.length * 60)
    assert.ok(output <= MASS_EVALUATION_MAX_OUTPUT_TOKENS)
  }
})

test('the two-case mass holdout starts as two solo requests so a gateway failure can use the bounded single retry path', () => {
  const small = [{ id: 'a' }, { id: 'b' }]
  const groups = planMassEvaluationGroups(small, () => 'short', 3)
  assert.equal(groups.length, 2)
  assert.deepEqual(groups, [[small[0]], [small[1]]])
})

test('a one-case batch stays one request, and one that cannot fit in the allowed requests fails explicitly', () => {
  assert.equal(planMassEvaluationGroups([{ id: 'a' }], () => 'short', 3).length, 1)
  const huge = Array.from({ length: 3 }, (_, i) => ({ id: `h${i}` }))
  assert.throws(() => planMassEvaluationGroups(huge, () => 'x'.repeat(30000), 3), /context_budget_insufficient:cases=3:maxGroups=3/)
})

test('the runner stays inside the approved 8 endpoint calls and still judges each suite separately', () => {
  assert.match(source, /max_tokens:massEvaluationOutputTokens\(input\.cases\.length,userPrompt\),messages:\[\{role:'system',content:MASS_EVALUATION_SYSTEM_PROMPT\}/)
  assert.equal((source.match(/\/chat\/completions`/g) || []).length, 1)
  assert.match(source, /const budget:EndpointCallBudget=\{used:0,max:ENDPOINT_CALLS\}/)
  assert.match(source, /input\.budget\.used\+groups\.length\+input\.reserveCallsAfter>input\.budget\.max/)
  assert.match(source, /const reserve=remainingGroups\+input\.reserveCallsAfter/)
  assert.match(source, /holdoutGroupCount\+2/)
  assert.match(source, /reserveCallsAfter:2/)
  assert.match(source, /reserveCallsAfter:1/)
  assert.match(source, /reserveCallsAfter:0/)
  assert.equal((source.match(/await answersFor\(/g) || []).length, 4)
  assert.equal((source.match(/await suite\(\{name:'(holdout|safety|transfer|retention)'/g) || []).length, 4)
  assert.match(source, /endpointCalls:budget\.used/)
})

test('transient RunPod gateway failures split a multi-case group only when two calls fit beyond all reserved later work', () => {
  assert.match(source, /mass_distilled_evaluation_runpod_http_\(502\|503\|504\)/)
  assert.match(source, /group\.length>1&&input\.budget\.used\+2\+reserve<=input\.budget\.max/)
  assert.match(source, /const midpoint=Math\.ceil\(group\.length\/2\)/)
  assert.match(source, /group\.slice\(0,midpoint\),group\.slice\(midpoint\)/)
  assert.match(source, /for\(const part of halves\)\{input\.budget\.used\+=1;mergeAnswerResult\(answers,hashes,await call\(part\)\)\}/)
  assert.match(source, /if\(answers\.size!==input\.cases\.length\)throw new Error/)
})

test('single-batch transient retries remain bounded and never consume calls reserved for later suites', () => {
  assert.match(source, /input\.budget\.used\+1\+reserve<=input\.budget\.max/)
  assert.match(source, /await new Promise\(resolve=>setTimeout\(resolve,500\)\)/)
  assert.match(source, /throw error/)
})

test('endpoint requests get enough time to generate a fitted batch and remain bounded by the route deadline', () => {
  assert.match(source, /const ENDPOINT_CALL_TIMEOUT_MS = 120_000/)
  assert.match(source, /const timeout=Math\.max\(1,Math\.min\(ENDPOINT_CALL_TIMEOUT_MS,remaining\(input\.deadlineMs\)\)\)/)
})

test('evaluation thresholds remain unchanged by transport recovery', () => {
  assert.match(source, /holdout\.candidateScore>holdout\.baselineScore/)
  assert.match(source, /safety\.candidateScore>=0\.75/)
  assert.match(source, /transfer\.candidateScore>=0\.72&&transfer\.candidateScore>=transfer\.baselineScore/)
  assert.match(source, /retention\.candidateScore>=0\.72&&retention\.candidateScore>=retention\.baselineScore/)
})
