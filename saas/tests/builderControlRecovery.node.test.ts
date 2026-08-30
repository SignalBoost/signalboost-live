import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import type { BuilderAiPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'

type ModelInput = Parameters<BuilderAiPort['generate']>[0]

test('Builder recovers the exact repository-repair control failure with a compact edit and no final prose round', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:repository-control-recovery'
  const path = 'lib/builder/repository-repair.ts'
  await workspace.writeFile(workspaceId, path, [
    'const result = await runRepair()',
    'if (!result.ok) {',
    '  throw new Error(result.error)',
    '}',
  ].join('\n'))

  let runs = 0
  const runner: BuilderRunnerPort = {
    async run(input) {
      runs += 1
      assert.equal(input.command, 'npm run typecheck')
      if (runs === 1) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: "Type error: Property 'error' does not exist on type 'BuilderLoopResult'.",
          timedOut: false,
        }
      }
      assert.match(input.files.find(file => file.path === path)?.content || '', /if \(result\.ok === false\)/)
      return { exitCode: 0, stdout: 'typecheck passed\n', stderr: '', timedOut: false }
    },
  }

  const inputs: ModelInput[] = []
  const responses = [
    `{"type":"tool","toolId":"read_file","input":{"path":"${path}"}}`,
    '{"type":"tool","toolId":"run","input":{"command":"npm run typecheck"}}',
    `{"type":"tool","toolId":"edit_file","input":{"path":"${path}","content":"full replacement"}}`,
    `{"type":"tool","toolId":"edit_file","input":{"path":"${path}","search":"if (!result.ok)","replace":"if (result.ok === false)"}}`,
    '{"type":"tool","toolId":"run","input":{"command":"npm run typecheck"}}',
  ]
  const ai: BuilderAiPort = {
    async generate(input) {
      inputs.push(input)
      return responses[inputs.length - 1] ?? null
    },
  }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: `Fix the TypeScript narrowing failure in ${path}.`,
    workspaceId,
    maxRounds: 6,
  })

  if (!result.ok) assert.fail(result.error)
  assert.equal(runs, 2)
  assert.equal(inputs.length, 5)
  assert.equal(inputs[0]?.maxTokens, 4_096)
  assert.match(inputs[2]?.prompt || '', /edit_file.*search.*replace/)
  assert.match(inputs[2]?.prompt || '', /prefer edit_file/i)
  assert.match(inputs[3]?.prompt || '', /CONTROL RECOVERY ATTEMPT 1/)
  assert.equal(inputs[3]?.maxTokens, 4_096)
  assert.match(result.answer, /repository-repair\.ts/)
  assert.match(result.answer, /npm run typecheck/)
  assert.deepEqual(result.trace.map(item => [item.toolId, item.ok]), [
    ['read_file', true],
    ['run', false],
    ['edit_file', true],
    ['run', true],
  ])
})

test('Builder retries a truncated control object once with a cache-distinct recovery prompt', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const inputs: ModelInput[] = []
  const responses = [
    '{"type":"answer","answer":"Workspace inspected."',
    '{"type":"answer","answer":"Workspace inspected."}',
  ]
  const ai: BuilderAiPort = {
    async generate(input) {
      inputs.push(input)
      return responses[inputs.length - 1] ?? null
    },
  }
  const runner: BuilderRunnerPort = {
    async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } },
  }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Describe the staged workspace.',
    workspaceId: 'user:truncated-control',
    maxRounds: 1,
  })

  assert.equal(result.ok, true)
  assert.equal(inputs.length, 2)
  assert.equal(inputs[0]?.maxTokens, 2_400)
  assert.equal(inputs[1]?.maxTokens, 4_096)
  assert.match(inputs[1]?.prompt || '', /CONTROL RECOVERY ATTEMPT 1/)
  assert.notEqual(inputs[0]?.prompt, inputs[1]?.prompt)
})

test('Builder extracts the valid balanced control object instead of joining unrelated braces', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const ai: BuilderAiPort = {
    async generate() {
      calls += 1
      return 'Planning metadata: {"note":"ignore this object"}\n{"type":"answer","answer":"Workspace inspected."}'
    },
  }
  const runner: BuilderRunnerPort = {
    async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } },
  }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Describe the staged workspace.',
    workspaceId: 'user:balanced-control',
    maxRounds: 1,
  })

  assert.equal(result.ok, true)
  assert.equal(calls, 1)
})

test('Builder bounds malformed-control recovery rather than looping indefinitely', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const ai: BuilderAiPort = {
    async generate() {
      calls += 1
      return 'not-json'
    },
  }
  const runner: BuilderRunnerPort = {
    async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } },
  }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Describe the staged workspace.',
    workspaceId: 'user:bounded-control-recovery',
    maxRounds: 1,
  })

  assert.equal(result.ok, false)
  if (result.ok === false) assert.equal(result.error, 'builder_invalid_model_control_output')
  assert.equal(calls, 2)
  assert.equal(result.trace.length, 0)
})
