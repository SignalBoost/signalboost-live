import assert from 'node:assert/strict'
import test from 'node:test'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

test('duplicate passing repair proof stops as unreproduced without another command or mutation', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'src/ok.js', 'export const ok = true\n')
  let calls = 0
  let runs = 0
  const actions = [
    { type: 'tool', toolId: 'read_file', input: { path: 'src/ok.js' } },
    { type: 'tool', toolId: 'run', input: { command: 'node --test tests/ok.test.js' } },
    { type: 'tool', toolId: 'run', input: { command: 'node --test tests/ok.test.js' } },
  ]
  const ai = { async generate() { return JSON.stringify(actions[calls++] ?? actions[2]) } }
  const runner = { async run() { runs += 1; return { exitCode: 0, stdout: 'tests 2\\npass 2\\nfail 0', stderr: '', timedOut: false } } }
  const result = await new BuilderToolLoop(ai, workspace, runner).run({
    objective: 'Repair the reported failure in src/ok.js and verify it with node --test tests/ok.test.js.',
    workspaceId: 'w',
    maxRounds: 12,
    deadlineAtMs: Date.now() + 220_000,
    minimumStepMs: 25_000,
  })
  assert.equal(result.ok, false)
  assert.equal('error' in result && result.error, 'builder_regression_not_reproduced')
  assert.equal(runs, 1, 'unchanged passing proof is never executed again')
  assert.equal(calls, 3, 'no additional model rounds after the duplicate passing proof')
  assert.equal(result.trace.filter(x => x.toolId === 'write_file' || x.toolId === 'edit_file').length, 0)
})
