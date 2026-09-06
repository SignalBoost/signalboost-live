import test from 'node:test'
import assert from 'node:assert/strict'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { evaluateRegressionGate } from '../lib/builder/regression-gate.ts'
import { deriveRepairPhase } from '../lib/builder/repair-phase.ts'
import type { BuilderAiPort, BuilderRunnerPort, BuilderToolTrace } from '../lib/builder/contracts.ts'

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

test('compiler proof requires the same command to fail before and pass after the repair', () => {
  const path = 'lib/builder/repository-repair.ts'
  const trace: BuilderToolTrace[] = [
    { round: 1, toolId: 'read_file', input: { path }, ok: true },
    { round: 2, toolId: 'run', input: { command: 'npm run typecheck' }, ok: false },
    { round: 3, toolId: 'edit_file', input: { path, search: '!result.ok', replace: 'result.ok === false' }, ok: true },
    { round: 4, toolId: 'run', input: { command: 'npm run build' }, ok: true },
  ]

  const wrongProof = evaluateRegressionGate('Fix the TypeScript failure.', trace, true)
  assert.equal(wrongProof.satisfied, false)
  if (!wrongProof.satisfied) assert.match(wrongProof.reason, /same proof command/i)
  assert.equal(deriveRepairPhase(trace, new Set([path])), 'verify')

  trace.push({ round: 5, toolId: 'run', input: { command: 'npm run typecheck' }, ok: true })
  assert.equal(evaluateRegressionGate('Fix the TypeScript failure.', trace, true).satisfied, true)
  assert.equal(deriveRepairPhase(trace, new Set([path])), 'complete')
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

test('Builder accepts equivalent OpenAI-style tool controls without weakening tool input validation', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const inputs: ModelInput[] = []
  const ai: BuilderAiPort = {
    async generate(input) {
      inputs.push(input)
      return '{"tool_calls":[{"function":{"name":"write_file","arguments":"{\\"path\\":\\"hello.js\\",\\"content\\":\\"console.log(1)\\"}"}}]}'
    },
  }
  const runner: BuilderRunnerPort = {
    async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } },
  }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Create hello.js.',
    workspaceId: 'user:provider-tool-control',
    maxRounds: 1,
  })

  assert.equal(result.ok, false)
  if (result.ok === false) assert.equal(result.error, 'builder_round_budget_exhausted')
  assert.equal(inputs.length, 1)
  assert.equal((await workspace.readFile('user:provider-tool-control', 'hello.js'))?.content, 'console.log(1)')
})

test('Builder accepts flattened action controls without weakening tool validation', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const ai: BuilderAiPort = {
    async generate() { return '{"action":"write_file","path":"hello.js","content":"console.log(1)"}' },
  }
  const runner: BuilderRunnerPort = {
    async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } },
  }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Create hello.js.',
    workspaceId: 'user:flattened-action-control',
    maxRounds: 1,
  })

  assert.equal(result.ok, false)
  if (result.ok === false) assert.equal(result.error, 'builder_round_budget_exhausted')
  assert.equal((await workspace.readFile('user:flattened-action-control', 'hello.js'))?.content, 'console.log(1)')
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
  if (result.ok === false) assert.equal(result.error, 'builder_model_control_malformed_json')
  assert.equal(calls, 2)
  assert.equal(result.trace.length, 1)
  assert.equal(result.trace[0]?.error, 'builder_model_control_malformed_json')
  assert.equal(result.trace[0]?.toolId, 'model_control')
  assert.match(result.trace[0]?.remediation || '', /parseable JSON|strict JSON/i)
})

test('Builder reports an empty model response as a runtime failure without exposing response content', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const ai: BuilderAiPort = { async generate() { calls += 1; return null } }
  const runner: BuilderRunnerPort = { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({ objective: 'Describe the staged workspace.', workspaceId: 'user:empty-control', maxRounds: 1 })

  assert.equal(result.ok, false)
  if (result.ok === false) assert.equal(result.error, 'builder_model_control_empty_response')
  assert.equal(calls, 2)
  assert.deepEqual(result.trace[0]?.output, { responseLength: 0, startsWithObject: false, endsWithObject: false, hasThinkOpen: false, hasThinkClose: false, hasUnclosedObject: false, anyValidJson: false })
  assert.equal(result.trace[0]?.failureClass, 'runtime')
})

test('Builder executes real reproduce and verify commands when the model answers too early', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:deterministic-regression-proof'
  const testPath = 'tests/builderAsyncJobs.node.test.ts'
  const sourcePath = 'lib/builder/fix.ts'
  await workspace.writeFile(workspaceId, testPath, 'assert.equal(flag, true)')
  await workspace.writeFile(workspaceId, sourcePath, 'const flag = false')

  let runs = 0
  const expectedCommand = `node --experimental-strip-types --test ${testPath}`
  const runner: BuilderRunnerPort = {
    async run(input) {
      runs += 1
      assert.equal(input.command, expectedCommand)
      if (runs === 1) {
        return { exitCode: 1, stdout: '', stderr: 'AssertionError: expected true', timedOut: false }
      }
      assert.equal(input.files.find(file => file.path === sourcePath)?.content, 'const flag = true')
      return { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false }
    },
  }

  const responses = [
    `{"type":"tool","toolId":"read_file","input":{"path":"${testPath}"}}`,
    '{"type":"answer","answer":"I inspected the failing test."}',
    `{"type":"tool","toolId":"edit_file","input":{"path":"${sourcePath}","search":"const flag = false","replace":"const flag = true"}}`,
    '{"type":"answer","answer":"The source is repaired."}',
  ]
  let calls = 0
  const ai: BuilderAiPort = { async generate() { return responses[calls++] ?? null } }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Fix the failing Builder regression and prove the repair.',
    workspaceId,
    maxRounds: 4,
  })

  if (!result.ok) assert.fail(result.error)
  assert.equal(calls, 4)
  assert.equal(runs, 2)
  assert.deepEqual(result.trace.map(item => [item.toolId, item.ok]), [
    ['read_file', true],
    ['run', false],
    ['edit_file', true],
    ['run', true],
  ])
  assert.ok(result.trace.filter(item => item.toolId === 'run').every(item => Boolean(item.input.command)))
})

test('Builder stops truthfully when the discovered regression proof passes and no defect is reproduced', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const workspaceId = 'user:regression-not-reproduced'
  const testPath = 'tests/builderAsyncJobs.node.test.ts'
  await workspace.writeFile(workspaceId, testPath, 'assert.equal(true, true)')

  const expectedCommand = `node --experimental-strip-types --test ${testPath}`
  let runs = 0
  const runner: BuilderRunnerPort = {
    async run(input) {
      runs += 1
      assert.equal(input.command, expectedCommand)
      return { exitCode: 0, stdout: 'pass\n', stderr: '', timedOut: false }
    },
  }
  const responses = [
    `{"type":"tool","toolId":"read_file","input":{"path":"${testPath}"}}`,
    '{"type":"answer","answer":"Looks fixed."}',
    '{"type":"answer","answer":"Looks fixed."}',
  ]
  let calls = 0
  const ai: BuilderAiPort = { async generate() { return responses[calls++] ?? null } }

  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Fix the reported Builder regression.',
    workspaceId,
    maxRounds: 3,
  })

  assert.equal(result.ok, false)
  if (result.ok === false) assert.equal(result.error, 'builder_regression_not_reproduced')
  assert.equal(calls, 3)
  assert.equal(runs, 1)
  assert.deepEqual(result.trace.map(item => [item.toolId, item.ok]), [
    ['read_file', true],
    ['run', true],
  ])
  assert.ok(result.trace.filter(item => item.toolId === 'run').every(item => Boolean(item.input.command)))
})

test('provider output limit switches to bounded append recovery instead of repeating the full file', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const inputs: ModelInput[] = []
  const result = await new BuilderToolLoop({ async generate(input) {
    inputs.push(input)
    if (inputs.length === 1) throw new Error('local_model_output_truncated')
    if (inputs.length === 2) {
      assert.match(input.prompt, /OUTPUT LIMIT RECOVERY/)
      assert.match(input.prompt, /2000 characters/)
      return JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path: 'catalog.json', mode: 'append', offset: 0, content: '[1,', final: false } })
    }
    if (inputs.length > 3) return JSON.stringify({ type: 'answer', answer: 'Created catalog.json.' })
    assert.equal(await workspace.readFile('chunk-recovery', 'catalog.json'), null)
    return JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path: 'catalog.json', mode: 'append', offset: 3, content: '2]', final: true } })
  } }, workspace, { async run() { assert.fail('no command requested') } }).run({ objective: 'Create catalog.json.', workspaceId: 'chunk-recovery', maxRounds: 3 })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal((await workspace.readFile('chunk-recovery', 'catalog.json'))?.content, '[1,2]')
})
