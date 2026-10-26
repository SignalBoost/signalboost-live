// saas/tests/builderToolLoopSpendCeilingPauses.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

const runner: BuilderRunnerPort = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }

function spentCeilingAi(): BuilderAiPort & { calls: number } {
  const ai = { calls: 0, async generate(): Promise<string> { ai.calls += 1; throw new Error('harness_provider_cost_budget_exceeded') } }
  return ai
}

test('a spent slice spend ceiling pauses the job with its checkpoint instead of failing it', async () => {
  const ai = spentCeilingAi()
  const result = await new BuilderToolLoop(ai, new InMemoryBuilderWorkspace(), runner).run({
    objective: 'Add a sum function to math.js with a passing test.',
    workspaceId: 'user:spend-ceiling',
    maxRounds: 4,
    modelRoundTimeoutMs: 5_000,
    shouldPause: () => false,
  })
  assert.equal(result.ok, false)
  if (result.ok === false) {
    assert.equal(result.error, 'builder_job_paused')
    assert.ok(result.checkpoint, 'the paused slice keeps its checkpoint so the next slice resumes')
  }
  assert.equal(ai.calls, 1, 'a refused call is not retried inside the spent slice')
})

test('without a slice scheduler the spend ceiling is still reported, not hidden', async () => {
  const result = await new BuilderToolLoop(spentCeilingAi(), new InMemoryBuilderWorkspace(), runner).run({
    objective: 'Add a sum function to math.js with a passing test.',
    workspaceId: 'user:spend-ceiling-direct',
    maxRounds: 4,
    modelRoundTimeoutMs: 5_000,
  })
  assert.equal(result.ok, false)
  if (result.ok === false) assert.equal(result.error, 'harness_provider_cost_budget_exceeded')
})
