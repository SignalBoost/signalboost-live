import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('review strategy does not import modelRouter directly', async () => {
  const source = await readFile(new URL('../lib/ai/reviewStrategy/index.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /@\/lib\/ai\/modelRouter/)
  assert.match(source, /createPlatformAiPort/)
})
