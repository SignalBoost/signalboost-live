// saas/tests/builderEditMatch.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { applySearchReplace } from '../lib/builder/edit-match.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'

const ok = (result: ReturnType<typeof applySearchReplace>) => {
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return result.ok ? result.content : ''
}

test('exact unique text is replaced as-is', () => {
  assert.equal(ok(applySearchReplace('a\nb\nc\n', 'b', 'B')), 'a\nB\nc\n')
})

test('replacement text containing $& and $$ is written literally', () => {
  assert.equal(ok(applySearchReplace('const total = 0\n', '0', "'$&' + '$$'")), "const total = '$&' + '$$'\n")
})

test('a CRLF file accepts an LF search block and keeps CRLF', () => {
  const file = 'function a() {\r\n  return 1\r\n}\r\n'
  assert.equal(ok(applySearchReplace(file, 'function a() {\n  return 1\n}\n', 'function a() {\n  return 2\n}\n')), 'function a() {\r\n  return 2\r\n}\r\n')
})

test('trailing spaces in the file do not hide the target', () => {
  assert.equal(ok(applySearchReplace('if (x) {   \n  go()\n}\n', 'if (x) {\n  go()\n}', 'if (y) {\n  go()\n}')), 'if (y) {\n  go()\n}\n')
})

test('production 2026-10-16: a block re-typed without its indentation lands and keeps that indentation', () => {
  const file = [
    'class Orders {',
    '  cancel(id) {',
    '    const order = this.get(id)',
    "    if (order.status === 'cancelled') throw new Error('already cancelled')",
    "    order.status = 'cancelled'",
    '  }',
    '}',
    '',
  ].join('\n')
  const edited = ok(applySearchReplace(file,
    "const order = this.get(id)\nif (order.status === 'cancelled') throw new Error('already cancelled')",
    "const order = this.get(id)\nif (order.status === 'cancelled') throw new OrderError('already cancelled')"))
  assert.match(edited, /\n    if \(order\.status === 'cancelled'\) throw new OrderError\('already cancelled'\)\n/)
  assert.match(edited, /\n    const order = this\.get\(id\)\n/)
})

test('a block matching more than once is refused, never applied to the first copy', () => {
  assert.deepEqual(applySearchReplace('x()\nx()\n', 'x()', 'y()'), { ok: false, error: 'builder_edit_target_ambiguous' })
  assert.deepEqual(applySearchReplace('  x()\n    x()\n', 'x()  ', 'y()'), { ok: false, error: 'builder_edit_target_ambiguous' })
})

test('different text is still not found', () => {
  assert.deepEqual(applySearchReplace('a\nb\n', 'c', 'd'), { ok: false, error: 'builder_edit_target_not_found' })
  assert.deepEqual(applySearchReplace('a\n', '', 'd'), { ok: false, error: 'builder_edit_target_not_found' })
  assert.deepEqual(applySearchReplace('  a\n   b\n', 'a\nb', 'z'), { ok: false, error: 'builder_edit_target_not_found' })
})

test('the workspace store applies the same tolerant edit', async () => {
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('w', 'src/cart.js', 'export function total(items) {\n  if (!items) return 0\n  return items.length\n}\n')
  const file = await workspace.editFile('w', 'src/cart.js', 'if (!items) return 0\nreturn items.length', 'if (!items) return 0\nreturn items.reduce((sum, item) => sum + item.price * item.qty, 0)')
  assert.match(file.content, /\n  return items\.reduce/)
  await assert.rejects(workspace.editFile('w', 'src/cart.js', 'missing', 'x'), /builder_edit_target_not_found/)
})

test('overlapping exact matches are ambiguous ("aa" in "aaa")', () => {
  assert.deepEqual(applySearchReplace('aaa', 'aa', 'X'), { ok: false, error: 'builder_edit_target_ambiguous' })
})

test('a tolerant edit in a mixed line-ending file leaves every untouched line ending as it was', () => {
  const file = 'a\r\nb  \nc\r\nd\n'
  const result = applySearchReplace(file, 'b\nc', 'B\nC')
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.content, 'a\r\nB\nC\r\nd\n')
})

test('a tolerant edit reports the exact text it removed and inserted', () => {
  const result = applySearchReplace('  if (x) {  \n    go()\n  }\n', 'if (x) {\n  go()\n}', 'if (y) {\n  stop()\n}')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.applied, { search: '  if (x) {  \n    go()\n  }', replace: '  if (y) {\n    stop()\n  }' })
    assert.equal(result.content, '  if (y) {\n    stop()\n  }\n')
  }
})

test('the Builder trace records the applied delta, not the model copy, for a tolerant edit', async () => {
  const { BuilderToolLoop } = await import('../lib/builder/tool-loop.ts')
  const workspace = new InMemoryBuilderWorkspace()
  await workspace.writeFile('trace', 'app.js', 'class A {\n  f() {\n    return 1\n  }\n}\n')
  const controls = [
    '{"type":"tool","toolId":"edit_file","input":{"path":"app.js","search":"return 1","replace":"return 2"}}',
    '{"type":"tool","toolId":"edit_file","input":{"path":"app.js","search":"f() {\\n  return 2\\n}","replace":"f() {\\n  return 3\\n}"}}',
    '{"type":"answer","answer":"done"}',
  ]
  let at = 0
  const result = await new BuilderToolLoop({ async generate() { return controls[at++] ?? null } }, workspace,
    { async run() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } } }).run({ objective: 'Update app.js', workspaceId: 'trace', maxRounds: 4 })
  const edits = result.trace.filter(item => item.toolId === 'edit_file' && item.ok)
  assert.equal(edits.length, 2)
  assert.equal(edits[1].input.search, '  f() {\n    return 2\n  }')
  assert.equal(edits[1].input.replace, '  f() {\n    return 3\n  }')
  assert.equal((await workspace.readFile('trace', 'app.js'))?.content, 'class A {\n  f() {\n    return 3\n  }\n}\n')
})
