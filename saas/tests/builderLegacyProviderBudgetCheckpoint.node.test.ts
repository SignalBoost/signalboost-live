import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const objective = 'Create hello.js and verify it with node --test hello.test.js'
const budget = () => { throw new Error('harness_provider_cost_budget_exceeded') }
const runner = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }

test('legacy Builder keeps its checkpoint when provider ceiling stops a slice after useful work', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const result = await new BuilderToolLoop({ async generate() {
    calls++
    if (calls === 1) return JSON.stringify({ type: 'tool', toolId: 'write_file', input: {
      path: 'hello.js', content: "console.log('hello')\\n",
    } })
    return budget()
  } }, workspace, runner).run({ objective, workspaceId: 'budget-with-edits', shouldPause: () => false })
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('expected recoverable slice')
  assert.equal(result.error, 'harness_provider_cost_budget_exceeded')
  assert.ok(result.checkpoint)
  assert.equal(result.checkpoint.version, 1)
  assert.ok(result.trace.some(item => item.toolId === 'write_file' && item.ok))
  assert.equal(calls, 2, 'provider ceiling is not retried in the same slice')
})

test('legacy Builder checkpoints even an initial provider ceiling without repeated model calls', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const result = await new BuilderToolLoop({ async generate() { calls++; return budget() } },
    workspace, runner).run({ objective, workspaceId: 'budget-no-edits', shouldPause: () => false })
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('expected bounded pause')
  assert.equal(result.error, 'harness_provider_cost_budget_exceeded')
  assert.ok(result.checkpoint)
  assert.equal(calls, 1)
})

test('durable job runner classifies provider-ceiling interruptions as bounded deferrals', () => {
  const source = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url),'utf8')
  assert.ok(source.includes("type SelfHealingDeferralReason ="))
  assert.ok(source.includes("harness_provider_cost_budget_exceeded"))
  assert.ok(source.includes("MAX_STANDARD_CAPACITY_DEFERRALS"))
  assert.ok(source.includes("await deferSelfHealingCapacity(job, result.error, trace, result.checkpoint ?? null)"))
})
