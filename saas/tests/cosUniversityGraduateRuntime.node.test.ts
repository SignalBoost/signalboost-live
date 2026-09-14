import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decideGraduateRuntimeBinding } from '../lib/ai/cos/cosUniversityGraduateRuntime.ts'

const H = 'b'.repeat(64)

const valid = (patch: Partial<Parameters<typeof decideGraduateRuntimeBinding>[0]> = {}) => ({
  candidateId: 'study-plan:11111111-1111-4111-8111-111111111111',
  trainedArtifactHash: H,
  runtimeProfile: 'graduate_ai' as const,
  runtimeModelId: 'signalboost/Qwen3-4B-reasoning-graduate',
  workerRoles: ['critic'] as const,
  problemClasses: ['planning and strategy', 'incident diagnosis'] as const,
  now: new Date('2026-09-14T00:15:00.000Z'),
  ...patch,
})

test('a promoted graduate runtime binding requires exact role and problem scope', () => {
  const decision = decideGraduateRuntimeBinding(valid())
  assert.equal(decision.eligibleForBinding, true)
  assert.deepEqual(decision.workerRoles, ['critic'])
  assert.deepEqual(decision.problemClasses, ['planning and strategy', 'incident diagnosis'])
  assert.deepEqual(decision.blockers, [])
})

test('runtime binding fails closed without a model or problem scope', () => {
  const noModel = decideGraduateRuntimeBinding(valid({ runtimeModelId: '' }))
  assert.equal(noModel.eligibleForBinding, false)
  assert.ok(noModel.blockers.includes('graduate_runtime_model_missing'))

  const noScope = decideGraduateRuntimeBinding(valid({ problemClasses: [] }))
  assert.equal(noScope.eligibleForBinding, false)
  assert.ok(noScope.blockers.includes('graduate_runtime_problem_scope_missing'))
})

test('database never stores graduate serving URLs or secrets', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260914001500_cos_university_graduate_runtime_binding.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /runtime_profile/)
  assert.match(migration, /'local_ai', 'graduate_ai'/)
  assert.doesNotMatch(migration, /api_key|secret|base_url/i)
})

test('COS control plane gives active graduates bounded priority with base fallback', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  assert.match(workers, /activeGraduateRuntimesForRole/)
  assert.match(workers, /priority:\s*200/)
  assert.match(workers, /\.\.\.graduates\.map\(createGraduateWorker\),\s*\.\.\.baseWorkers/s)
  assert.match(workers, /if \(currentReasoningEvaluationContext\(\)\) return new CosReasoningEngine\(baseWorkers\)/)
  assert.match(workers, /universityGraduate:\s*true/)
})

test('graduate worker usage remains distinguishable from ordinary runtime usage', () => {
  const workers = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
  assert.match(workers, /feature:\s*'cos_university_graduate_worker'/)
  assert.match(workers, /graduateArtifactHash/)
  assert.match(workers, /graduateRuntimeProvider/)
})
