import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('independent exam worker isolates reads, run identity, and assessment writes per agent', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityIndependentExamRunner.ts', import.meta.url), 'utf8')
  assert.match(source, /agentId\?: string/)
  assert.match(source, /\.eq\('agent_id', agentId\)/)
  assert.match(source, /EXAM_PROFILE}:\${agentId}/)
  assert.match(source, /recordCosUniversityAssessment\(\{\s*agentId,/)
  assert.doesNotMatch(source, /const AGENT_ID = 'cos'/)
})

test('post-remediation exams use a fresh study-round identity and reconcile only that plan', () => {
  const runner = readFileSync(new URL('../lib/ai/cos/cosUniversityIndependentExamRunner.ts', import.meta.url), 'utf8')
  const store = readFileSync(new URL('../lib/ai/cos/cosUniversityStore.ts', import.meta.url), 'utf8')
  assert.match(runner, /attemptCount: Number\(row\.attempt_count \|\| 0\)/)
  assert.match(runner, /:plan:\${readyPlan\.id}:study-attempt:\${readyPlan\.attemptCount}/)
  assert.match(runner, /runTarget\(agentId, target, now, readyPlan\)/)
  assert.match(store, /row\.status !== 'superseded'/)
  assert.match(store, /status: 'queued'/)
  assert.match(store, /\.eq\('id', row\.id\)\.eq\('status', 'superseded'\)/)
})

test('autonomous cycle executes an eligible independent exam for each registered identity', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityAutonomousAgentCycle.ts', import.meta.url), 'utf8')
  assert.match(source, /nextAction === 'independent_exam'/)
  assert.match(source, /runCosUniversityIndependentExamBatch\(\{ now, agentId: agent\.agentId/)
})
