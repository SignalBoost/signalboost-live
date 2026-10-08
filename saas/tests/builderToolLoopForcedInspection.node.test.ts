// saas/tests/builderToolLoopForcedInspection.node.test.ts
//
// Builder Residency defect found 2026-10-06 while recording Builder protocol practice. After a failed proof run, the
// loop forces a read of any workspace file the failure output names. When the model had ALREADY read that file before
// running, the forced read was rejected as a repeat of unchanged content, every round, so the loop ended
// builder_stalled_repeated_inspection after two model calls, however good the resident was. Residency check scripts
// throw, and node's stack trace names the script, so "read verify.js, then run it" walked straight into the trap.
import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const CHECK = "const fs=require('fs');if(!fs.existsSync('plan.json'))throw new Error('missing plan')\nconsole.log('ok')\n"

test('a file read before the failing run is not force-read again, so the resident keeps the turn', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'check.js', CHECK)
  const replies = [
    { type: 'tool', toolId: 'read_file', input: { path: 'check.js' } },
    { type: 'tool', toolId: 'run', input: { command: 'node check.js' } },
    { type: 'tool', toolId: 'write_file', input: { path: 'plan.json', content: '{"target":"d2"}\n' } },
    { type: 'tool', toolId: 'run', input: { command: 'node check.js' } },
  ]
  let calls = 0
  const ai = { async generate() { return JSON.stringify(replies[calls++] ?? { type: 'answer', answer: 'done' }) } }
  const runner = {
    async run(input: { files: readonly { path: string }[] }) {
      const done = input.files.some(file => file.path === 'plan.json')
      return done
        ? { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
        // What node prints for an uncaught throw: the stack names the script that was already read.
        : { exitCode: 1, stdout: '', stderr: "/sandbox/check.js:1\nconst fs=require('fs');if(!fs.existsSync('plan.json'))throw new Error('missing plan')\nError: missing plan\n    at Object.<anonymous> (/sandbox/check.js:1:72)\n", timedOut: false }
    },
  }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Run check.js, use its failure to record plan.json with the rollback target d2, and prove node check.js.',
    workspaceId: 'w',
    maxRounds: 16,
    deadlineAtMs: Date.now() + 220_000,
    minimumStepMs: 25_000,
  })
  assert.equal(result.ok, true, `loop stopped with ${'error' in result ? result.error : 'no error'}`)
  assert.equal(calls, 4, 'every step was the resident\'s own')
  assert.ok(!result.trace.some(entry => String(entry.error || '').startsWith('builder_repeated_tool_call')), 'no step was rejected as a repeat')
})

test('a file the failure names that was NOT read yet is still force-read once', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'check.js', CHECK)
  const replies = [
    { type: 'tool', toolId: 'run', input: { command: 'node check.js' } },
    { type: 'tool', toolId: 'write_file', input: { path: 'plan.json', content: '{"target":"d2"}\n' } },
    { type: 'tool', toolId: 'run', input: { command: 'node check.js' } },
  ]
  let calls = 0
  const ai = { async generate() { return JSON.stringify(replies[calls++] ?? { type: 'answer', answer: 'done' }) } }
  const runner = {
    async run(input: { files: readonly { path: string }[] }) {
      return input.files.some(file => file.path === 'plan.json')
        ? { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
        : { exitCode: 1, stdout: '', stderr: 'Error: missing plan\n    at Object.<anonymous> (/sandbox/check.js:1:72)\n', timedOut: false }
    },
  }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Run check.js, use its failure to record plan.json with the rollback target d2, and prove node check.js.',
    workspaceId: 'w',
    maxRounds: 16,
    deadlineAtMs: Date.now() + 220_000,
    minimumStepMs: 25_000,
  })
  assert.equal(result.ok, true)
  assert.deepEqual(result.trace.map(entry => `${entry.toolId}:${entry.ok}`), ['run:false', 'read_file:true', 'write_file:true', 'run:true'])
})


test('two rejected retries after a failed run force a source mutation even without a new inspection', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'check.js', CHECK)
  const prompts: string[] = []
  let wrote = false
  const ai = { async generate(input: any) {
    const prompt = JSON.stringify(input)
    prompts.push(prompt)
    if (prompt.includes('The defect is reproduced and the bounded diagnostic allowance is exhausted')) {
      wrote = true
      return JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path: 'plan.json', content: '{"target":"d2"}\\n' } })
    }
    if (wrote) return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node check.js' } })
    return JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node check.js' } })
  } }
  const runner = { async run(input: { files: readonly { path: string }[] }) {
    return input.files.some(file => file.path === 'plan.json')
      ? { exitCode: 0, stdout: 'ok\\n', stderr: '', timedOut: false }
      : { exitCode: 1, stdout: '', stderr: 'Error: missing plan', timedOut: false }
  } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Repair check.js failure, create plan.json and verify the fix.',
    workspaceId: 'w', maxRounds: 16, deadlineAtMs: Date.now() + 220_000, minimumStepMs: 25_000,
  })
  assert.equal(wrote, true, 'controller must force mutation after refused repeat runs')
  assert.ok(prompts.some(prompt => prompt.includes('The defect is reproduced and the bounded diagnostic allowance is exhausted')))
  assert.ok(result.trace.some(entry => entry.toolId === 'write_file' && entry.ok))
  assert.ok(result.trace.some(entry => entry.toolId === 'run' && entry.ok))
})
// end of saas/tests/builderToolLoopForcedInspection.node.test.ts (if this line is missing, the paste was cut short)
