import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const layoutPath = new URL('../app/dashboard/supervisor/layout.tsx', import.meta.url)

async function source() {
  return readFile(layoutPath, 'utf8')
}

test('supervisor navigation exposes the protocol capability catalog', async () => {
  const text = await source()
  assert.match(text, /\/dashboard\/supervisor\/protocol-capabilities/)
  assert.match(text, /Protocol Capabilities/)
  assert.match(text, /Operations Center/)
  assert.match(text, /Mission Reviews/)
})

test('supervisor navigation preserves the read-only boundary', async () => {
  const text = await source()
  assert.match(text, /Read-only diagnostics/)
  assert.doesNotMatch(text, /onClick=/)
  assert.doesNotMatch(text, /fetch\(/)
  assert.doesNotMatch(text, /POST|PUT|PATCH|DELETE/)
})
