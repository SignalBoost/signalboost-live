import assert from 'node:assert/strict'
import test from 'node:test'
import { isPastedOperationalLog } from '../lib/ai/cos/pastedOperationalLog.ts'

test('recognizes a pasted Vercel build log as operational evidence', () => {
  const log = [
    '02:18:55.460 Running build in Cleveland, USA',
    '02:18:57.633 Running vercel build',
    'Vercel CLI 59.3.0',
    'Running node scripts/vercel-cos-gates.mjs && npm run prebuild && next build',
  ].join('\n')
  assert.equal(isPastedOperationalLog(log), true)
  assert.equal(isPastedOperationalLog('Fix the add function in src/math.js.'), false)
})
