import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('independent exam worker isolates reads, run identity, and assessment writes per agent', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityIndependentExamRunner.ts', import.meta.url), 'utf8')
  const identity = readFileSync(new URL('../lib/ai/cos/cosUniversityExamRunIdentity.ts', import.meta.url), 'utf8')
  assert.match(source, /agentId\?: string/)
  assert.match(source, /\.eq\('agent_id', agentId\)/)
  assert.match(source, /profile: COS_UNIVERSITY_EXAM_PROFILE,[\s\S]*agentId,/)
  assert.match(identity, /input\.profile}:\${input\.agentId}/)
  assert.match(source, /recordCosUniversityAssessment\(\{\s*agentId,/)
  assert.doesNotMatch(source, /const AGENT_ID = 'cos'/)
})

test('autonomous cycle executes an eligible independent exam for each registered identity', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityAutonomousAgentCycle.ts', import.meta.url), 'utf8')
  assert.match(source, /nextAction === 'independent_exam'/)
  assert.match(source, /runCosUniversityIndependentExamBatch\(\{ now, agentId: agent\.agentId/)
})
