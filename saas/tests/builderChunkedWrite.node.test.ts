import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { assembleBuilderChunk } from '../lib/builder/chunked-write.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { normalizeBuilderControlOutput } from '../lib/builder/control-adapter.ts'

const chunk = (content: string, chunkIndex: number, final: boolean, path = 'large.js') => JSON.stringify({ type: 'tool', toolId: 'write_file', input: { path, content, chunkIndex, final } })
const neverRun = { async run(): Promise<never> { assert.fail('incomplete source cannot execute') } }

test('provider control normalization preserves chunk indices and boolean final flags', async () => {
  const input = { path: 'large.js', content: 'first segment', chunkIndex: 0, final: false }
  let called = false
  const workspace = new InMemoryBuilderWorkspace()
  const result = await new BuilderToolLoop({ async generate() {
    called = true
    return normalizeBuilderControlOutput(JSON.stringify({ tool_calls: [{ function: { name: 'write_file', arguments: JSON.stringify(input) } }] }))
  } }, workspace, neverRun).run({ objective: 'Create large.js.', workspaceId: 'native', shouldPause: beforeTool => !beforeTool && called })
  if (result.ok || !result.checkpoint) assert.fail('expected staged native tool control')
  assert.equal(result.checkpoint.pendingWrite?.content, input.content)
  assert.equal(result.checkpoint.pendingWrite?.nextIndex, 1)
  assert.equal((await workspace.listFiles('native')).length, 0)
})

test('chunk assembly preserves exact text and rejects duplicate, skipped, malformed and cross-file chunks', () => {
  const first = assembleBuilderChunk(null, { path: 'large.js', content: 'hello\r\n', chunkIndex: 0, final: false }, null)
  const final = assembleBuilderChunk(first.file, { path: 'large.js', content: '世界', chunkIndex: 1, final: true }, null)
  assert.equal(final.file.content, 'hello\r\n世界')
  for (const input of [
    { path: 'large.js', content: 'duplicate', chunkIndex: 0, final: true },
    { path: 'large.js', content: 'gap', chunkIndex: 2, final: true },
    { path: 'other.js', content: 'wrong file', chunkIndex: 1, final: true },
    { path: '../host.js', content: 'escape', chunkIndex: 1, final: true },
    { path: 'large.js', content: 'bad flag', chunkIndex: 1, final: 'false' },
    { path: 'large.js', content: '\0', chunkIndex: 1, final: false },
  ]) assert.throws(() => assembleBuilderChunk(first.file, input, null))
  assert.equal(first.file.content, 'hello\r\n', 'rejected proposals never mutate staged content')
})

test('assembled file size and chunk-count limits cannot be bypassed with small chunks', () => {
  const first = assembleBuilderChunk(null, { path: 'large.js', content: 'a'.repeat(512 * 1024 - 1), chunkIndex: 0, final: false }, null)
  assert.throws(() => assembleBuilderChunk(first.file, { path: 'large.js', content: 'é', chunkIndex: 1, final: true }, null), /file_too_large/)
  const fifteenth = { ...first.file, content: 'x', nextIndex: 15 }
  assert.throws(() => assembleBuilderChunk(fifteenth, { path: 'large.js', content: 'x', chunkIndex: 15, final: false }, null), /chunk_limit/)
  assert.equal(assembleBuilderChunk(fifteenth, { path: 'large.js', content: 'x', chunkIndex: 15, final: true }, null).final, true)
})

test('a 600-line file is assembled across a checkpoint and executes real Node only after finalization', async () => {
  const source = Array.from({ length: 600 }, (_, i) => `const value${i} = ${i};`).join('\n') + '\nconsole.log(value599);\n'
  const pieces = [source.slice(0, 5000), source.slice(5000, 10000), source.slice(10000)]
  const workspace = new InMemoryBuilderWorkspace()
  const objective = 'Create:\n- large.js\nRun:\nnode large.js'
  let calls = 0
  let runs = 0
  const first = await new BuilderToolLoop({ async generate() { return chunk(pieces[calls], calls++, false) } }, workspace, neverRun)
    .run({ objective, workspaceId: 'large', shouldPause: beforeTool => !beforeTool && calls === 2 })
  if (first.ok || !first.checkpoint) assert.fail('expected saved partial file')
  assert.equal((await workspace.listFiles('large')).length, 0)
  assert.equal(first.checkpoint.writeCount, 0)
  assert.equal(first.checkpoint.pendingWrite?.nextIndex, 2)
  assert.deepEqual(first.trace.map(item => item.toolId), ['stage_file', 'stage_file'])
  const dir = await mkdtemp(join(tmpdir(), 'builder-chunks-'))
  try {
    const result = await new BuilderToolLoop({ async generate(input) {
      assert.match(input.prompt, /nextChunkIndex":2/)
      assert.ok(input.prompt.includes(JSON.stringify(pieces.join('').slice(0, 10000).slice(-4000)).slice(1, -1)))
      return chunk(pieces[2], 2, true)
    } }, workspace, { async run(input) {
      runs++
      assert.equal(input.command, 'node large.js')
      assert.equal(input.files[0].content, source)
      await writeFile(join(dir, 'large.js'), input.files[0].content)
      const result = spawnSync(process.execPath, ['large.js'], { cwd: dir, encoding: 'utf8', timeout: 10_000 })
      assert.equal(result.error, undefined); assert.equal(result.signal, null)
      return { exitCode: result.status!, stdout: result.stdout, stderr: result.stderr, timedOut: false }
    } }).run({ objective, workspaceId: 'large', checkpoint: JSON.parse(JSON.stringify(first.checkpoint)) })
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(runs, 1)
    assert.equal((await workspace.readFile('large', 'large.js'))?.content, source)
    assert.equal(result.trace.filter(item => item.toolId === 'write_file' && item.ok).length, 1)
    assert.equal((result.trace.at(-1)?.output as { stdout: string }).stdout, '599\n')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('pending chunks block answer and run even when an older complete file exists', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('old', 'large.js', 'old source')
  const actions = [chunk('replacement fragment', 0, false), JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node large.js' } }), JSON.stringify({ type: 'answer', answer: 'Done' })]
  const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, workspace, neverRun)
    .run({ objective: 'Fix large.js.', workspaceId: 'old', maxRounds: 3 })
  assert.equal(result.ok, false)
  assert.equal(result.trace.filter(item => item.error === 'builder_chunk_incomplete').length, 2)
  assert.equal((await workspace.readFile('old', 'large.js'))?.content, 'old source')
})

test('a rejected duplicate chunk does not corrupt a later valid completion', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const actions = [chunk('console.', 0, false), chunk('console.', 0, false), chunk('log("ok");', 1, true)]
  const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, workspace, { async run() {
    return { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
  } }).run({ objective: 'Create:\n- large.js\nRun:\nnode large.js', workspaceId: 'duplicate' })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.ok(result.trace.some(item => item.error?.includes('builder_chunk_out_of_order')))
  assert.equal((await workspace.readFile('duplicate', 'large.js'))?.content, 'console.log("ok");')
})

test('a file changed between chunks is not overwritten by finalization', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  let calls = 0
  const result = await new BuilderToolLoop({ async generate() {
    calls++
    if (calls === 1) return chunk('console.', 0, false)
    await workspace.writeFile('changed', 'large.js', 'another writer')
    return chunk('log("ok");', 1, true)
  } }, workspace, neverRun).run({ objective: 'Create large.js.', workspaceId: 'changed', maxRounds: 2 })
  assert.equal(result.ok, false)
  assert.ok(result.trace.some(item => item.error === 'builder_chunk_workspace_changed'))
  assert.equal((await workspace.readFile('changed', 'large.js'))?.content, 'another writer')
})

test('chunked existing-file repair retains fail/change/pass proof and does not weaken the test', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('repair', 'large.js', 'module.exports = 0;')
  const proof = "require('node:assert/strict').equal(require('./large.js'), 42);"
  await workspace.writeFile('repair', 'large.test.js', proof)
  const run = JSON.stringify({ type: 'tool', toolId: 'run', input: { command: 'node --test large.test.js' } })
  const actions = [JSON.stringify({ type: 'tool', toolId: 'read_file', input: { path: 'large.js' } }), run, chunk('module.exports = ', 0, false), chunk('42;', 1, true), run]
  const dir = await mkdtemp(join(tmpdir(), 'builder-chunk-repair-'))
  try {
    const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, workspace, { async run(input) {
      for (const file of input.files) await writeFile(join(dir, file.path), file.content)
      const env = { ...process.env }; delete env.NODE_TEST_CONTEXT
      const result = spawnSync(process.execPath, ['--test', 'large.test.js'], { cwd: dir, env, encoding: 'utf8', timeout: 10_000 })
      assert.equal(result.error, undefined); assert.equal(result.signal, null)
      return { exitCode: result.status!, stdout: result.stdout, stderr: result.stderr, timedOut: false }
    } }).run({ objective: 'Fix large.js to export 42. Run:\nnode --test large.test.js', workspaceId: 'repair' })
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.deepEqual(result.trace.filter(item => item.toolId === 'run').map(item => item.ok), [false, true])
    assert.equal((await workspace.readFile('repair', 'large.test.js'))?.content, proof)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('a failed final storage write can be retried without appending its chunk twice', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  const write = workspace.writeFile.bind(workspace)
  let writes = 0
  workspace.writeFile = async (...args) => {
    if (++writes === 1) throw new Error('builder_file_write: temporary storage failure')
    return write(...args)
  }
  const actions = [chunk('console.', 0, false), chunk('log("ok");', 1, true), chunk('log("ok");', 1, true)]
  const result = await new BuilderToolLoop({ async generate() { return actions.shift() || null } }, workspace, { async run() {
    return { exitCode: 0, stdout: 'ok\n', stderr: '', timedOut: false }
  } }).run({ objective: 'Create:\n- large.js\nRun:\nnode large.js', workspaceId: 'retry' })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(writes, 2)
  assert.equal((await workspace.readFile('retry', 'large.js'))?.content, 'console.log("ok");')
})
