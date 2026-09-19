import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const source = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const hosted = source('lib/ai/cos/cosUniversityHostedTeacherCurriculum.ts')
const replenishment = source('lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts')
const pool = source('lib/ai/cos/cosUniversityTeacherPool.ts')

test('multi-provider hosted teachers are wired into live curriculum replenishment', () => {
  assert.match(replenishment, /installHostedTeacherCurriculum/)
  const failureCall = replenishment.indexOf('const failureDerived = await installVerifiedFailureDerivedCurriculum')
  const hostedCall = replenishment.indexOf('const hostedTeachers = await installHostedTeacherCurriculum')
  const syntheticCall = replenishment.indexOf('const synthetic = await installTeacherSyntheticFallback')
  assert.ok(failureCall >= 0 && hostedCall >= 0 && syntheticCall >= 0)
  assert.ok(failureCall < hostedCall)
  assert.ok(hostedCall < syntheticCall)
  assert.match(replenishment, /'hosted_teacher'/)
  assert.match(replenishment, /hostedTeacherInserted/)
})

test('hosted teacher fan-out uses the enterprise selector and real provider adapters', () => {
  assert.match(hosted, /selectUniversityTeacher/)
  assert.match(hosted, /generateWithUniversityTeacher/)
  assert.match(hosted, /'openai_responses'/)
  assert.match(hosted, /'openai_compatible'/)
  assert.match(hosted, /'anthropic_messages'/)
  assert.match(hosted, /'custom_adapter'/)
  assert.match(hosted, /Promise\.allSettled/)
  assert.match(hosted, /providerCursor % hosted\.length/)
  assert.match(hosted, /providerScheduling: 'deterministic_round_robin'/)
  assert.match(hosted, /teacher_hosted_curriculum/)
})

test('hosted teacher generation is explicitly budgeted and fail-closed', () => {
  assert.match(hosted, /COS_UNIVERSITY_TEACHER_HOSTED_MAX_CALLS_PER_CYCLE/)
  assert.match(hosted, /hosted_teacher_call_budget_not_authorized/)
  assert.match(hosted, /HARD_MAX_CALLS_PER_CYCLE = 48/)
  assert.match(hosted, /HARD_MAX_OUTPUT_TOKENS = 2048/)
  assert.match(hosted, /HARD_MAX_PARALLELISM = 6/)
  assert.match(hosted, /silentFallbackAllowed: false/)
  assert.match(hosted, /authorityExpanded: false/)
})

test('every requested enterprise provider remains represented in the pool', () => {
  for (const marker of ["id: 'qwen'", "id: 'deepseek'", "id: 'openai'", "id: 'claude'", "id: 'grok'", "id: 'custom'"]) {
    assert.ok(pool.includes(marker), `missing ${marker}`)
  }
})


test('hosted teacher activation is bounded in Vercel production config', () => {
  const vercel = JSON.parse(source('vercel.json'))
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_HOSTED_MAX_CALLS_PER_CYCLE, '8')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_HOSTED_MAX_OUTPUT_TOKENS, '1200')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_HOSTED_PARALLELISM, '4')
})
