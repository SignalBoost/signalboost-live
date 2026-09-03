import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDER_TURN_TIMEOUT_ERROR,
  createGovernedBuilderAiPort,
  normalizeBuilderControlOutput,
} from '../lib/builder/control-adapter.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

function decodedControl(value: string): Record<string, unknown> {
  const normalized = normalizeBuilderControlOutput(value)
  assert.equal(typeof normalized, 'string')
  return JSON.parse(normalized as string) as Record<string, unknown>
}

test('Builder normalizes the exact live Qwen run-control aliases', () => {
  const command = 'npm test 2>&1 | head -100'
  const expected = { type: 'tool', toolId: 'run', input: { command } }

  assert.deepEqual(decodedControl(`run {"command":"${command}"}`), expected)
  assert.deepEqual(decodedControl(`{"type":"run","command":"${command}"}`), expected)
  assert.deepEqual(
    decodedControl(`The workspace is already at the root. {"type":"run","command":"${command}"}`),
    expected,
  )
  assert.deepEqual(decodedControl(`run command: \`${command}\``), expected)
})

test('Builder normalizes the exact live DeepSeek XML and native tool-call envelopes', () => {
  assert.deepEqual(
    decodedControl("I'll start by inspecting the implicated files. <tool> <toolId>read_file</toolId> <input> <path>package.json</path> </input> </tool>"),
    { type: 'tool', toolId: 'read_file', input: { path: 'package.json' } },
  )
  assert.deepEqual(
    decodedControl('I will run the narrow check. <tool_calls> <run command="npm run validate:next-routes" /> </tool_calls>'),
    { type: 'tool', toolId: 'run', input: { command: 'npm run validate:next-routes' } },
  )
  assert.deepEqual(
    decodedControl('<tool_calls> <invoke name="run"> <parameter name="command">node scripts/vercel-cos-gates.mjs &amp;&amp; npm run prebuild</parameter> </invoke> </tool_calls>'),
    { type: 'tool', toolId: 'run', input: { command: 'node scripts/vercel-cos-gates.mjs && npm run prebuild' } },
  )
  assert.deepEqual(
    decodedControl('Let me verify it. <tool_call name="run"> {"input":{"command":"next build"}} </tool_call>'),
    { type: 'tool', toolId: 'run', input: { command: 'next build' } },
  )
})

test('DeepSeek control normalization never expands the Builder tool allowlist', () => {
  const unsupported = '<tool><toolId>delete_file</toolId><input><path>package.json</path></input></tool>'
  assert.equal(normalizeBuilderControlOutput(unsupported), unsupported)
})

test('normalized aliases still pass through Builder tool validation and execution evidence', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:provider-control-adapter'
  const responses = [
    '{"type":"write_file","path":"hello.js","content":"console.log(1)"}',
    'run {"command":"node hello.js"}',
  ]
  let modelCalls = 0
  const rawAi: BuilderAiPort = {
    async generate() {
      const response = responses[modelCalls] ?? null
      modelCalls += 1
      return response
    },
  }
  const runner: BuilderRunnerPort = {
    async run(input) {
      assert.equal(input.command, 'node hello.js')
      assert.equal(input.files.find(file => file.path === 'hello.js')?.content, 'console.log(1)')
      return { exitCode: 0, stdout: '1\n', stderr: '', timedOut: false }
    },
  }

  const result = await new BuilderToolLoop(
    createGovernedBuilderAiPort(rawAi, { maxElapsedMs: 5_000 }),
    workspace,
    runner,
  ).run({
    objective: 'Create hello.js and run it with Node.js.',
    workspaceId,
    maxRounds: 2,
    modelRoundTimeoutMs: 1_000,
  })

  assert.equal(result.ok, true)
  assert.equal(modelCalls, 2)
  assert.equal((await workspace.readFile(workspaceId, 'hello.js'))?.content, 'console.log(1)')
})

test('the governed Builder deadline returns one terminal error without model retry', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let modelCalls = 0
  const rawAi: BuilderAiPort = {
    async generate() {
      modelCalls += 1
      return await new Promise<string | null>(() => {})
    },
  }
  const runner: BuilderRunnerPort = {
    async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } },
  }

  const result = await new BuilderToolLoop(
    createGovernedBuilderAiPort(rawAi, { deadlineAtMs: Date.now() + 25 }),
    workspace,
    runner,
  ).run({
    objective: 'Describe the staged workspace.',
    workspaceId: 'user:builder-turn-deadline',
    maxRounds: 1,
    modelRoundTimeoutMs: 5_000,
  })

  assert.equal(result.ok, false)
  if (result.ok === false) assert.equal(result.error, BUILDER_TURN_TIMEOUT_ERROR)
  assert.equal(modelCalls, 1)
})
