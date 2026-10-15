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

test('conflicting write preserves source and permits explicit repair', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } })
  await dispatcher.dispatch('test', { tool: 'write_file', path: 'src/storage.js', content: 'before' })
  const conflict = await dispatcher.dispatch('test', { tool: 'write_file', path: 'src/storage.js', content: 'after' })
  assert.equal(conflict.error, 'builder_write_content_conflict')
  assert.equal((await workspace.readFile('test', 'src/storage.js'))?.content, 'before')
  const change = await dispatcher.dispatch('test', { tool: 'edit_file', path: 'src/storage.js', search: 'before', replace: 'after' })
  assert.equal(change.ok, true)
  assert.equal((await workspace.readFile('test', 'src/storage.js'))?.content, 'after')
})

test('host verification failure is preserved and can be repaired', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let count = 0
  const dispatcher = new BuilderV2Dispatcher(workspace, { async run({ files }) {
    count++
    const fixed = files.some(file => file.path === 'src/storage.js' && file.content === 'fixed')
    return { exitCode: fixed ? 0 : 1, stdout: '', stderr: fixed ? '' : 'Assertion failed', timedOut: false }
  } })
  await dispatcher.dispatch('test', { tool: 'write_file', path: 'src/storage.js', content: 'broken' })
  assert.equal((await dispatcher.dispatch('test', { tool: 'run_tests', command: 'node --test' })).error, 'builder_tests_failed')
  await dispatcher.dispatch('test', { tool: 'edit_file', path: 'src/storage.js', search: 'broken', replace: 'fixed' })
  assert.equal((await dispatcher.dispatch('test', { tool: 'run_tests', command: 'node --test' })).ok, true)
  assert.equal(count, 2)
})
