import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeOperationalLog, isPastedOperationalLog, operationalLogReply } from '../lib/ai/cos/pastedOperationalLog.ts'

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


test('reports a final test failure instead of calling the log incomplete', () => {
  const log = [
    '15:27:17.225 Running "vercel build"',
    '16:07:21.324 ✖ both answer paths resolve markers before anything else sees the text',
    'Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ].join('\n')
  const analysis = analyzeOperationalLog(log)
  assert.equal(analysis.failed, true)
  assert.equal(analysis.exitCode, 1)
  assert.equal(analysis.testFailures.length, 1)
  assert.match(operationalLogReply(log), /This Vercel build failed/)
  assert.match(operationalLogReply(log), /both answer paths resolve markers/i)
})
