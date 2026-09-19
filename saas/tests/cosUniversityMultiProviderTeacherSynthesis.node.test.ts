import test from 'node:test'
import assert from 'node:assert/strict'
import {
  maximumHostedTeacherBatchCostUsd,
  universityTeacherDistillationRightsAuthorized,
  universityTeacherPricingFor,
} from '../lib/ai/cos/cosUniversityMultiProviderTeacherSynthesis.ts'
import { UNIVERSITY_TEACHERS } from '../lib/ai/cos/cosUniversityTeacherPool.ts'

const byId = (id: string) => UNIVERSITY_TEACHERS.find(item => item.id === id)!

test('hosted proprietary teachers fail closed without explicit contractual distillation rights', () => {
  assert.equal(universityTeacherDistillationRightsAuthorized(byId('openai'), {}), false)
  assert.equal(universityTeacherDistillationRightsAuthorized(byId('claude'), {}), false)
  assert.equal(universityTeacherDistillationRightsAuthorized(byId('grok'), {}), false)
  assert.equal(universityTeacherDistillationRightsAuthorized(byId('qwen'), {}), true)
})

test('hosted teacher pricing must be explicitly configured', () => {
  assert.equal(universityTeacherPricingFor(byId('openai'), {}), null)
  assert.deepEqual(universityTeacherPricingFor(byId('openai'), {
    COS_UNIVERSITY_TEACHER_OPENAI_INPUT_USD_PER_MILLION: '2',
    COS_UNIVERSITY_TEACHER_OPENAI_OUTPUT_USD_PER_MILLION: '8',
  }), { inputUsdPerMillion: 2, outputUsdPerMillion: 8 })
})

test('batch cost authorization is conservative and bounded before hosted dispatch', () => {
  const cost = maximumHostedTeacherBatchCostUsd({
    teacher: byId('openai'),
    prompts: Array.from({ length: 20 }, (_, index) => ({ id: String(index).padStart(8, '0'), prompt: 'x'.repeat(1000) })),
    env: {
      COS_UNIVERSITY_TEACHER_OPENAI_INPUT_USD_PER_MILLION: '1',
      COS_UNIVERSITY_TEACHER_OPENAI_OUTPUT_USD_PER_MILLION: '4',
    },
  })
  assert.ok(cost != null && cost > 0)
  assert.ok(cost! < 0.20)
})
