import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = async (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('shared AI modes route through the COS AI port', async () => {
  const source = await read('../lib/ai/modes.ts')

  assert.match(source, /createPlatformAiPort/)
  assert.doesNotMatch(source, /callModel/)
  assert.match(source, /cacheValidator: validLocalResponse/)
  assert.match(source, /cacheValidator: validBusinessResponse/)
  assert.match(source, /cacheValidator: validCreativeResponse/)
  assert.match(source, /cacheValidator: validGlobalResponse/)
})
