import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('Builder extracts TAP failing test names rather than silently returning an empty list', () => {
  const source = readFileSync(new URL('../lib/builder/tool-loop.ts', import.meta.url), 'utf8')
  assert.ok(source.includes(String.raw`matchAll(/^\s*[✖×]\s+(.+)$/gm)`))
  assert.ok(!source.includes(String.raw`matchAll(/^\\s*[✖×]\\s+(.+)$/gm)`))
  const failing = [
    '✖ orders createOrder rejects a cart exceeding inventory (1.2ms)',
    '  × orders rejected order does not reduce inventory (1.3ms)',
  ].join('\n')
  const names = [...failing.matchAll(/^\s*[✖×]\s+(.+)$/gm)].map(m => m[1])
  assert.deepEqual(names, [
    'orders createOrder rejects a cart exceeding inventory (1.2ms)',
    'orders rejected order does not reduce inventory (1.3ms)',
  ])
})
