// saas/tests/builderTimeBudget.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import type { BuilderAiPort, BuilderRunnerPort, BuilderWorkspacePort } from '../lib/builder/contracts.ts'

const jobRunner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')

function workspaceStub(): BuilderWorkspacePort {
  const files = new Map<string, { path: string; content: string; updatedAt: number }>()
  return {
    listFiles: async () => [...files.values()].map(file => ({ path: file.path, updatedAt: file.updatedAt })),
    readFile: async (_id, path) => files.get(path) || null,
    writeFile: async (_id, path, content) => {
      const file = { path, content, updatedAt: Date.now() }
      files.set(path, file)
      return file
    },
    editFile: async (_id, path) => files.get(path) || { path, content: '', updatedAt: Date.now() },
  } as unknown as BuilderWorkspacePort
}

const runnerStub: BuilderRunnerPort = { run: async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }) }

test('a round is never started that the remaining wall clock cannot finish', async () => {
  let calls = 0
  const ai: BuilderAiPort = { generate: async () => { calls += 1; return '{"type":"tool","toolId":"list_files","input":{}}' } }
  const loop = new BuilderToolLoop(ai, workspaceStub(), runnerStub)
  const result = await loop.run({
    objective: 'Describe the workspace.',
    workspaceId: 'ws',
    maxRounds: 40,
    deadlineAtMs: Date.now() + 5_000,
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'builder_time_budget_reached')
  assert.equal(calls, 0, 'no model call may be spent on a round the clock cannot finish')
  assert.deepEqual(result.trace, [], 'the evidence is returned, not discarded')
})

test('an ample deadline does not stop the loop early', async () => {
  const ai: BuilderAiPort = { generate: async () => '{"type":"answer","answer":"Inspected."}' }
  const loop = new BuilderToolLoop(ai, workspaceStub(), runnerStub)
  const result = await loop.run({
    objective: 'Describe the workspace.',
    workspaceId: 'ws',
    maxRounds: 40,
    deadlineAtMs: Date.now() + 600_000,
  })
  assert.equal(result.ok, true)
})

test('an absent deadline preserves the previous unbounded-clock behaviour', async () => {
  const ai: BuilderAiPort = { generate: async () => '{"type":"answer","answer":"Inspected."}' }
  const loop = new BuilderToolLoop(ai, workspaceStub(), runnerStub)
  const result = await loop.run({ objective: 'Describe the workspace.', workspaceId: 'ws', maxRounds: 40 })
  assert.equal(result.ok, true)
})

test('the durable job passes its own deadline down and no longer caps rounds at a low constant', () => {
  assert.match(jobRunner, /maxRounds: 96/)
  assert.match(jobRunner, /deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS/)
  assert.doesNotMatch(jobRunner, /maxRounds: isRepairObjective\(job\.objective\) \? 20 : 16/)
  assert.match(gate, /tests\/builderTimeBudget\.node\.test\.ts/)
})
