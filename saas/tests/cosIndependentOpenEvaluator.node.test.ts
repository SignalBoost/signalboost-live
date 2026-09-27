import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveIndependentOpenEvaluator } from '../lib/ai/cos/independentOpenEvaluator.ts'

function withEnv(values: Record<string,string|undefined>, fn:()=>void) {
  const before: Record<string,string|undefined> = {}
  for (const [k,v] of Object.entries(values)) { before[k]=process.env[k]; if(v===undefined) delete process.env[k]; else process.env[k]=v }
  try { fn() } finally { for(const [k,v] of Object.entries(before)) { if(v===undefined) delete process.env[k]; else process.env[k]=v } }
}

test('open evaluator is optional and never implies frontier fallback', () => withEnv({
  COS_OPEN_EVALUATOR_BASE_URL: undefined, COS_OPEN_EVALUATOR_MODEL: undefined,
}, () => assert.equal(resolveIndependentOpenEvaluator(), null)))

test('same primary model and endpoint cannot evaluate itself', () => withEnv({
  LOCAL_AI_BASE_URL:'http://localhost:8000/v1', LOCAL_AI_MODEL:'qwen-primary',
  COS_OPEN_EVALUATOR_BASE_URL:'http://localhost:8000/v1', COS_OPEN_EVALUATOR_MODEL:'qwen-primary',
}, () => assert.throws(() => resolveIndependentOpenEvaluator(), /not_independent/)))

test('different open model can be a separately identified evaluator', () => withEnv({
  LOCAL_AI_BASE_URL:'http://localhost:8000/v1', LOCAL_AI_MODEL:'qwen-primary',
  COS_OPEN_EVALUATOR_BASE_URL:'http://localhost:8001/v1', COS_OPEN_EVALUATOR_MODEL:'deepseek-evaluator',
}, () => {
  const resolved=resolveIndependentOpenEvaluator()
  assert.equal(resolved?.identity.model,'deepseek-evaluator')
  assert.match(resolved?.identity.label || '',/^independent-open-evaluator:/)
}))

test('cognitive learning has no proprietary evaluator constructor', () => {
  for (const path of ['../lib/ai/cos/cognitiveActiveLearning.ts','../lib/ai/cos/cognitiveSkillComposition.ts']) {
    const source=readFileSync(new URL(path, import.meta.url),'utf8')
    assert.doesNotMatch(source,/createExternalTeacherAiPort|configuredEvaluatorProvider/)
    assert.match(source,/callIndependentOpenEvaluator/)
  }
})
