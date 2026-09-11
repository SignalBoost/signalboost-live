import test from 'node:test'
import assert from 'node:assert/strict'
import { runCOSMissionGraph } from '../lib/cos-core/orchestration/langgraph-mission.ts'

test('COS LangGraph mission completes after independently verified first execution', async () => {
  const result = await runCOSMissionGraph(
    { goal: 'produce evidence' },
    {
      plan: ({ goal }) => ({ goal, version: 1 }),
      execute: ({ plan, attempt }) => ({ artifact: `${plan.goal}:${attempt}` }),
      verify: ({ result }) => ({ ok: result.artifact === 'produce evidence:1' }),
    },
  )

  assert.equal(result.status, 'verified')
  assert.equal(result.attempts, 1)
  assert.deepEqual(result.trace, ['plan', 'execute:1', 'verify:1:pass'])
})

test('COS LangGraph mission repairs a failed plan and re-verifies within the bounded loop', async () => {
  const transitions: string[] = []
  const result = await runCOSMissionGraph(
    'mission',
    {
      plan: () => ({ version: 1 }),
      execute: ({ plan, attempt }) => ({ version: plan.version, attempt }),
      verify: ({ result }) => result.version === 2 ? { ok: true } : { ok: false, reason: 'evidence incomplete' },
      repair: ({ plan }) => ({ version: plan.version + 1 }),
      onTransition: ({ stage, attempt }) => { transitions.push(`${stage}:${attempt}`) },
    },
    { maxAttempts: 2 },
  )

  assert.equal(result.status, 'verified')
  assert.equal(result.attempts, 2)
  assert.equal(result.result.version, 2)
  assert.deepEqual(result.trace, ['plan', 'execute:1', 'verify:1:fail', 'repair:1', 'execute:2', 'verify:2:pass'])
  assert.deepEqual(transitions, ['plan:0', 'execute:1', 'verify:1', 'repair:1', 'execute:2', 'verify:2'])
})

test('COS LangGraph mission stops unverified when no governed repair path exists', async () => {
  const result = await runCOSMissionGraph(
    'mission',
    {
      plan: () => 'plan',
      execute: () => 'result',
      verify: () => ({ ok: false, reason: 'missing proof' }),
    },
  )

  assert.equal(result.status, 'unverified')
  assert.equal(result.attempts, 1)
  assert.equal(result.reason, 'missing proof')
  assert.deepEqual(result.trace, ['plan', 'execute:1', 'verify:1:fail'])
})

test('COS LangGraph mission caps retry attempts even when a caller requests an excessive loop', async () => {
  const result = await runCOSMissionGraph(
    'mission',
    {
      plan: () => 1,
      execute: ({ attempt }) => attempt,
      verify: () => ({ ok: false, reason: 'still failing' }),
      repair: ({ plan }) => plan + 1,
    },
    { maxAttempts: 99 },
  )

  assert.equal(result.status, 'unverified')
  assert.equal(result.attempts, 3)
  assert.equal(result.result, 3)
})
