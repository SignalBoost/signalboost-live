// saas/tests/builderToolLoopRepeatedRunAfterFailure.node.test.ts
//
// Builder Residency, Production 2026-10-07: 3 of 4 failed test_and_regression_construction cases ended
// `run:fail > read_file:ok > run:builder_repeated_tool_call x7..x10` and stopped builder_stalled_repeated_inspection.
// The resident re-asked for the failed command against unchanged source. The controller's "make the edit now" step only
// triggered after three inspections or an early answer, so a resident that read once and then insisted on running never
// reached it. A rejected repeat run after an inspected failure now triggers that same step. Proof is unchanged: the
// regression gate still requires the failing run before the edit and a passing run after it.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const BROKEN = "function slug(value) {\n  return value.toLowerCase().replace(' ', '-')\n}\nmodule.exports = { slug }\n"
const TEST = "const { slug } = require('./slug.js')\nif (slug('Hello   World!') !== 'hello-world') throw new Error(slug('Hello   World!'))\nconsole.log('ok')\n"
const MUTATION_STEP = 'CURRENT STEP: The defect is reproduced and the bounded diagnostic allowance is exhausted.'

// A resident that, like Production, keeps asking to run after reading, and only edits when the controller demands it.
function insistentResident(obeysMutationStep: boolean) {
  const prompts: string[] = []
  const ai = {
    async generate(input: { prompt: string }) {
      prompts.push(input.prompt)
      if (prompts.length === 1) return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node slug.test.js' } })
      if (prompts.length === 2) return JSON.stringify({ type: 'tool', toolId: 'read_file', input: { path: 'slug.js' } })
      if (obeysMutationStep && input.prompt.includes(MUTATION_STEP)) {
        return JSON.stringify({ type: 'tool', toolId: 'edit_file', input: { path: 'slug.js', search: ".replace(' ', '-')", replace: ".replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')" } })
      }
      return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node slug.test.js' } })
    },
  }
  return { ai, prompts }
}

const runner = {
  async run(input: { files: readonly { path: string; content: string }[] }) {
    const fixed = input.files.find(file => file.path === 'slug.js')?.content.includes('[^a-z0-9]+')
    return fixed
      ? { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
      : { exitCode: 1, stdout: '', stderr: 'Error: hello-world!\n    at Object.<anonymous> (/sandbox/slug.test.js:2:68)\n', timedOut: false }
  },
}

async function residency(obeysMutationStep: boolean) {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'slug.js', BROKEN)
  await workspace.writeFile('w', 'slug.test.js', TEST)
  const resident = insistentResident(obeysMutationStep)
  const result = await new BuilderToolLoop(resident.ai, workspace, runner).run({
    objective: 'Repair slug.js and add a regression test that proves repeated whitespace and punctuation normalize safely. Run the test command and preserve the evidence.',
    workspaceId: 'w',
    maxRounds: 16,
    deadlineAtMs: Date.now() + 220_000,
    minimumStepMs: 25_000,
  })
  return { result, prompts: resident.prompts }
}

test('one rejected repeat run after an inspected failure moves the resident to the edit step', async () => {
  const { result, prompts } = await residency(true)
  assert.equal(result.ok, true, `loop stopped with ${'error' in result ? result.error : 'no error'}`)
  // The failure's stack names slug.test.js, so the controller reads it; the resident reads slug.js itself.
  assert.deepEqual(result.trace.map(entry => `${entry.toolId}:${entry.ok}`), [
    'run:false', 'read_file:true', 'read_file:true', 'run:false', 'edit_file:true', 'run:true',
  ])
  assert.ok(String(result.trace[3].error).startsWith('builder_repeated_tool_call:run'))
  const editPrompt = prompts[3]
  assert.ok(editPrompt.includes(MUTATION_STEP), 'the round after the repeat demands the edit')
  assert.ok(editPrompt.includes('TOOLS: ["write_file","edit_file"]'), 'only mutation tools are offered')
})

test('the edit step is not offered before the failure was inspected', async () => {
  const { prompts } = await residency(true)
  assert.ok(!prompts[1].includes(MUTATION_STEP), 'right after the failing run the resident may still read the source')
})

test('a resident that ignores the edit step still fails closed; nothing passes without a passing proof', async () => {
  const { result } = await residency(false)
  assert.equal(result.ok, false)
  assert.ok(!result.trace.some(entry => entry.toolId === 'run' && entry.ok), 'no passing run was recorded')
})
// end of saas/tests/builderToolLoopRepeatedRunAfterFailure.node.test.ts (if this line is missing, the paste was cut short)
