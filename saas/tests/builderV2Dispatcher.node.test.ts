import test from 'node:test'
import assert from 'node:assert/strict'
import { BuilderV2Dispatcher } from '../lib/builder/agent-v2-dispatcher.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

test('repeated file request is idempotent and verification executes', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let runs = 0
  const dispatcher = new BuilderV2Dispatcher(workspace, {
    async run() { runs++; return { exitCode: 0, stdout: 'pass', stderr: '', timedOut: false } },
  })
  const action = { tool: 'write_file' as const, path: 'src/storage.js', content: 'export default {}' }
  assert.equal((await dispatcher.dispatch('test', action)).changed, true)
  const repeated = await dispatcher.dispatch('test', action)
  assert.equal(repeated.ok, true)
  assert.equal(repeated.changed, false)
  assert.equal((await dispatcher.dispatch('test', { tool: 'run_tests', command: 'node --test' })).ok, true)
  assert.equal(runs, 1)
})
