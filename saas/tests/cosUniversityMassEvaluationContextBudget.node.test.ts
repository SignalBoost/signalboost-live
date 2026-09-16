// saas/tests/cosUniversityMassEvaluationContextBudget.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MASS_EVALUATION_MODEL_CONTEXT_TOKENS, MASS_EVALUATION_SYSTEM_PROMPT, massEvaluationOutputTokens, planMassEvaluationGroups } from '../lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts'

const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

test('the conservative 3 characters per token estimate is kept after the 4 per token calibration was disproven', () => {
  // 18:33 UTC: 1307 output tokens were requested for a batch estimated at 6886 tokens and the provider still rejected it.
  const prompt = 'x'.repeat(27030 - MASS_EVALUATION_SYSTEM_PROMPT.length)
  assert.throws(() => massEvaluationOutputTokens(8, prompt), /mass_distilled_evaluation_context_budget_insufficient:cases=8:estimatedPromptTokens=9138/)
})

test('short batches keep the previous budget and never exceed 4096 output tokens', () => {
  assert.equal(massEvaluationOutputTokens(2, 'short prompt'), 1024)
  assert.equal(massEvaluationOutputTokens(8, 'x'.repeat(3000)), 3360)
  assert.ok(massEvaluationOutputTokens(12, 'x'.repeat(3000)) <= 4096)
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
    assert.ok(output >= group.length * 120)
  }
})

test('a batch that fits keeps a single request, and one that cannot fit in the allowed requests fails explicitly', () => {
  const small = [{ id: 'a' }, { id: 'b' }]
  assert.equal(planMassEvaluationGroups(small, () => 'short', 3).length, 1)
  const huge = Array.from({ length: 3 }, (_, i) => ({ id: `h${i}` }))
  assert.throws(() => planMassEvaluationGroups(huge, () => 'x'.repeat(30000), 3), /context_budget_insufficient:cases=3:maxGroups=3/)
})

test('the runner stays inside the approved 8 endpoint calls and still judges each suite separately', () => {
  assert.match(source, /max_tokens:massEvaluationOutputTokens\(input\.cases\.length,userPrompt\),messages:\[\{role:'system',content:MASS_EVALUATION_SYSTEM_PROMPT\}/)
  assert.equal((source.match(/\/chat\/completions`/g) || []).length, 1)
  assert.match(source, /const budget:EndpointCallBudget=\{used:0,max:ENDPOINT_CALLS\}/)
  assert.match(source, /if\(input\.budget\.used\+groups\.length>input\.budget\.max\)throw new Error/)
  assert.match(source, /cases:holdoutCases,maxGroups:3/)
  assert.match(source, /cases:fixedCases,maxGroups:1/)
  assert.equal((source.match(/await answersFor\(/g) || []).length, 4, '3 + 3 holdout requests at most, plus 1 + 1 fixed-suite requests')
  assert.equal((source.match(/await suite\(\{name:'(holdout|safety|transfer|retention)'/g) || []).length, 4)
})
