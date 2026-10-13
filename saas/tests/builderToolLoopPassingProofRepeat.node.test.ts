// saas/tests/builderToolLoopPassingProofRepeat.node.test.ts
//
// Production 2026-10-12 (workspace f1640d1a): a repair whose regression test PASSED on its first run. With no failure
// recorded, no controller step applied, so the resident kept re-requesting the same run and re-reading the same files.
// Every request was rejected as builder_repeated_tool_call and nothing stopped the loop: a scripted copy of that
// resident spent 130 model calls for 1 executed command and the job ended "the work limit was reached".
// The controller now (1) tells the resident the passing command does not reproduce the defect and what to do instead,
// and (2) ends after three consecutive rejected repeats with the honest terminal result.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { isBuilderTestRunnerCommand } from '../lib/builder/regression-gate.ts'

const OBJECTIVE = 'Fix the power stabilization release gate so the advisory diagnosis answer is correct.'
const PROOF = 'node --experimental-strip-types --test regression/gate.node.test.ts'
const NEW_PROOF = 'node --experimental-strip-types --test regression/advisory.node.test.ts'
const NOT_REPRODUCED_STEP = 'does not reproduce the reported defect'

async function seededWorkspace() {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'lib/gate.ts', "export const releasable = (draft: string) => !draft.includes('rank')\n")
  await workspace.writeFile('w', 'lib/advisory.ts', "export const intent = (q: string) => q.includes('power') ? 'power' : 'other'\n")
  await workspace.writeFile('w', 'regression/gate.node.test.ts', "import test from 'node:test'\ntest('gate', () => {})\n")
  return workspace
}

// The reported resident: inspect, run the passing proof, inspect more, then alternate the same run and read forever.
function loopingResident() {
  const prompts: string[] = []
  const script = [
    { type: 'tool', toolId: 'read_file', input: { path: 'lib/gate.ts' } },
    { type: 'tool', toolId: 'run', input: { command: PROOF } },
    { type: 'tool', toolId: 'read_file', input: { path: 'lib/advisory.ts' } },
    { type: 'tool', toolId: 'read_file', input: { path: 'regression/gate.node.test.ts' } },
  ]
  const ai = { async generate(input: { prompt: string }) {
    prompts.push(input.prompt)
    const next = script[prompts.length - 1] ?? (prompts.length % 2 ? script[0] : script[1])
    return JSON.stringify(next)
  } }
  return { ai, prompts }
}

// A resident that follows the controller: once told the proof does not reproduce, it writes a failing regression test.
function obedientResident() {
  const prompts: string[] = []
  let wroteTest = false, edited = false
  const ai = { async generate(input: { prompt: string }) {
    prompts.push(input.prompt)
    if (prompts.length === 1) return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: PROOF } })
    if (!wroteTest && input.prompt.includes(NOT_REPRODUCED_STEP)) {
      wroteTest = true
      return JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path: 'regression/advisory.node.test.ts', content: "import test from 'node:test'\ntest('advisory', () => {})\n" } })
    }
    if (wroteTest && prompts.length === 3) return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: NEW_PROOF } })
    if (wroteTest && !edited) {
      edited = true
      return JSON.stringify({ type: 'tool', toolId: 'edit_file', input: { path: 'lib/advisory.ts', search: "q.includes('power')", replace: "/power|dvfs|voltage/i.test(q)" } })
    }
    return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: NEW_PROOF } })
  } }
  return { ai, prompts }
}

function countingRunner() {
  const state = { executed: 0 }
  const runner = { async run(input: { command: string; files: readonly { path: string; content: string }[] }) {
    state.executed += 1
    const fixed = input.files.find(file => file.path === 'lib/advisory.ts')?.content.includes('dvfs')
    if (input.command.includes('advisory') && !fixed) return { exitCode: 1, stdout: '', stderr: 'AssertionError: DVFS question classified as other\n', timedOut: false }
    return { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
  } }
  return { runner, state }
}

const run = async (ai: { generate(input: { prompt: string }): Promise<string> }, runner: unknown) =>
  new BuilderToolLoop(ai as any, await seededWorkspace(), runner as any).run({
    objective: OBJECTIVE, workspaceId: 'w', maxRounds: 64, deadlineAtMs: Date.now() + 10_000_000, minimumStepMs: 1,
  })

test('a passing proof followed by repeated requests ends promptly as not reproduced', async () => {
  const resident = loopingResident()
  const { runner, state } = countingRunner()
  const result = await run(resident.ai, runner)
  assert.equal(result.ok, false)
  assert.equal('error' in result ? result.error : '', 'builder_regression_not_reproduced')
  assert.equal(state.executed, 1, 'only the one real proof run executed')
  assert.ok(resident.prompts.length <= 10, `bounded model calls, got ${resident.prompts.length}`)
  const trailing = result.trace.slice(-3)
  assert.ok(trailing.every(entry => String(entry.error).startsWith('builder_repeated_tool_call:')), 'stopped on three consecutive repeats')
})

test('after the passing proof, the resident is told the command does not reproduce the defect', async () => {
  const resident = loopingResident()
  await run(resident.ai, countingRunner().runner)
  assert.ok(!resident.prompts[1].includes(NOT_REPRODUCED_STEP), 'not claimed before the proof ran')
  assert.ok(resident.prompts[2].includes(NOT_REPRODUCED_STEP), 'claimed right after the passing run')
  assert.ok(resident.prompts[2].includes(JSON.stringify(PROOF)), 'names the command that passed')
})

test('a resident that follows the step reproduces the defect, repairs it, and passes the regression gate', async () => {
  const resident = obedientResident()
  const { runner } = countingRunner()
  const result = await run(resident.ai, runner)
  assert.equal(result.ok, true, `loop stopped with ${'error' in result ? result.error : 'no error'}`)
  assert.deepEqual(result.trace.map(entry => `${entry.toolId}:${entry.ok}`), [
    'run:true', 'write_file:true', 'run:false', 'edit_file:true', 'run:true',
  ])
  assert.ok(!result.trace.some(entry => String(entry.error || '').startsWith('builder_repeated_tool_call:')))
})

for (const diagnostic of ['node --version', 'echo test', 'rg test src', 'node scripts/print-env.js']) {
  test(`a passing diagnostic (${diagnostic}) is not proof that the defect was not reproduced`, async () => {
    const prompts: string[] = []
    const ai = { async generate(input: { prompt: string }) {
      prompts.push(input.prompt)
      if (prompts.length === 1) return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: diagnostic } })
      return JSON.stringify({ type: 'tool', toolId: 'read_file', input: { path: prompts.length % 2 ? 'lib/gate.ts' : 'lib/advisory.ts' } })
    } }
    const result = await run(ai, countingRunner().runner)
    assert.equal(result.ok, false)
    assert.equal('error' in result ? result.error : '', 'builder_stalled_repeated_inspection')
    assert.ok(!prompts.some(prompt => prompt.includes(NOT_REPRODUCED_STEP)), 'a diagnostic never claims the defect is unreproduced')
  })
}

test('only commands that invoke a test runner, test file, typecheck or build count as a passing proof', () => {
  for (const command of [PROOF, 'node --test', 'node --import ./scripts/test-alias-loader.mjs --test tests/a.node.test.ts',
    'node slug.test.js', 'npx vitest run', 'npm test', 'pnpm run typecheck', 'npx tsc --noEmit', 'next build']) {
    assert.equal(isBuilderTestRunnerCommand(command), true, command)
  }
  for (const command of ['node --version', 'echo test', 'rg test src', 'node scripts/print-env.js', 'git status',
    'cat src/a.test.ts', 'node scripts/print-env.js --test']) {
    assert.equal(isBuilderTestRunnerCommand(command), false, command)
  }
})

test('a stall that is not a passing-proof case keeps the stalled-inspection result', async () => {
  const prompts: string[] = []
  const ai = { async generate(input: { prompt: string }) {
    prompts.push(input.prompt)
    return JSON.stringify({ type: 'tool', toolId: 'read_file', input: { path: prompts.length % 2 ? 'lib/gate.ts' : 'lib/advisory.ts' } })
  } }
  const result = await run(ai, countingRunner().runner)
  assert.equal(result.ok, false)
  assert.equal('error' in result ? result.error : '', 'builder_stalled_repeated_inspection')
  assert.ok(prompts.length <= 12, `bounded model calls, got ${prompts.length}`)
})
// end of saas/tests/builderToolLoopPassingProofRepeat.node.test.ts (if this line is missing, the paste was cut short)
