import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

test('after failed proof, an unavailable repeated run is corrected in the same round', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'check.js', "if (!require('fs').existsSync('plan.json')) throw Error('missing plan')\n")
  const replies = [
    { type: 'tool', toolId: 'read_file', input: { path: 'check.js' } },
    { type: 'tool', toolId: 'run', input: { command: 'node check.js' } },
    { type: 'tool', toolId: 'read_file', input: { path: 'check.js' } },
    { type: 'tool', toolId: 'run', input: { command: 'node check.js' } },
    { type: 'tool', toolId: 'write_file', input: { path: 'plan.json', content: '{"ok":true}\n' } },
    { type: 'tool', toolId: 'run', input: { command: 'node check.js' } },
  ]
  let calls = 0
  const prompts: string[] = []
  const ai = { async generate(input: { prompt?: string }) {
    prompts.push(String(input.prompt || ''))
    return JSON.stringify(replies[calls++] ?? { type: 'answer', answer: 'done' })
  } }
  const runner = { async run(input: { files: readonly { path: string }[] }) {
    return input.files.some(file => file.path === 'plan.json')
      ? { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false }
      : { exitCode: 1, stdout: '', stderr: 'Error: missing plan', timedOut: false }
  } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Repair the failing check.js by creating plan.json and rerun node check.js to verify.',
    workspaceId: 'w', maxRounds: 12, deadlineAtMs: Date.now() + 220_000, minimumStepMs: 25_000,
  })
  assert.equal(result.ok, true, 'repair succeeds after one unavailable-tool control retry')
  assert.ok(prompts.some(prompt => prompt.includes('Only these tools are available NOW:')))
  assert.ok(!result.trace.some(item => item.error === 'builder_repair_mutation_not_produced'))
})
