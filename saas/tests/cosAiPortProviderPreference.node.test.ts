import assert from 'node:assert/strict'
import test from 'node:test'
import type { CosAiPort } from '../lib/cos/aiPort.ts'

test('COS AI port contract permits provider preference during legacy migration', async () => {
  const seen: string[] = []
  const port: CosAiPort = {
    async generate(input) {
      seen.push(input.modelPreference || 'default')
      return 'ok'
    },
  }

  assert.equal(await port.generate({ prompt: 'promo', modelPreference: 'openai' }), 'ok')
  assert.equal(await port.generate({ prompt: 'social', modelPreference: 'claude' }), 'ok')
  assert.deepEqual(seen, ['openai', 'claude'])
})
