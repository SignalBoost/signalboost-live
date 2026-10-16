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
