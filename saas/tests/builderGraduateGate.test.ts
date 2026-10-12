import assert from 'node:assert/strict'
import test from 'node:test'
import {
  builderGraduateAllowed, builderGraduateMode, builderGraduateTimeoutMs,
  recordBuilderGraduateResult, resetBuilderGraduateBreaker,
} from '../lib/builder/builderGraduateGate.ts'

test('graduates do not serve Builder unless explicitly set to serve', () => {
  assert.equal(builderGraduateMode({} as NodeJS.ProcessEnv), 'shadow')
  assert.equal(builderGraduateMode({ BUILDER_GRADUATE_MODE: 'serve' } as NodeJS.ProcessEnv), 'serve')
  assert.equal(builderGraduateMode({ BUILDER_GRADUATE_MODE: 'nonsense' } as NodeJS.ProcessEnv), 'shadow')
})

test('graduate timeout is short and bounded', () => {
  assert.equal(builderGraduateTimeoutMs({} as NodeJS.ProcessEnv), 20_000)
  assert.equal(builderGraduateTimeoutMs({ BUILDER_GRADUATE_TIMEOUT_MS: '999999' } as NodeJS.ProcessEnv), 60_000)
})

test('three failures open the breaker; it closes after cooldown or success', () => {
  resetBuilderGraduateBreaker()
  const t = 1_000_000
  for (let i = 0; i < 3; i++) recordBuilderGraduateResult('m', false, t)
  assert.equal(builderGraduateAllowed('m', t + 1), false)
  assert.equal(builderGraduateAllowed('m', t + 15 * 60_000 + 1), true)
  recordBuilderGraduateResult('m', true, t)
  assert.equal(builderGraduateAllowed('m', t), true)
})
