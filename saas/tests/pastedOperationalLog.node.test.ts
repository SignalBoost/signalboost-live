import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeOperationalLog,
  hasExplicitOperationalLogRepairIntent,
  isExplicitOperationalLogRepairRequest,
  isOperationalLogEvidence,
  isPastedOperationalLog,
  operationalLogReply,
} from '../lib/ai/cos/pastedOperationalLog.ts'

test('recognizes a pasted Vercel build log as passive operational evidence', () => {
  const log = [
    '02:18:55.460 Running build in Cleveland, USA',
    '02:18:57.633 Running vercel build',
    'Vercel CLI 59.3.0',
    'Running node scripts/vercel-cos-gates.mjs && npm run prebuild && next build',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isPastedOperationalLog(log), true)
  assert.equal(isPastedOperationalLog('Fix the add function in src/math.js.'), false)
})

test('standalone repair intent is detectable without manufacturing log evidence', () => {
  assert.equal(hasExplicitOperationalLogRepairIntent('please debug this'), true)
  assert.equal(hasExplicitOperationalLogRepairIntent('fix it'), true)
  assert.equal(isOperationalLogEvidence('please debug this'), false)
  assert.equal(isExplicitOperationalLogRepairRequest('please debug this'), false)
})

test('explicit debug/fix language is distinguishable from passive pasted log evidence', () => {
  const log = [
    'Please debug this build.',
    '15:27:17.225 Running "vercel build"',
    'Error: Command "npm test" exited with 1',
  ].join('\n')
  assert.equal(isOperationalLogEvidence(log), true)
  assert.equal(isExplicitOperationalLogRepairRequest(log), true)
  assert.equal(isPastedOperationalLog(log), false)

  const passive = log.replace('Please debug this build.\n', '')
  assert.equal(isExplicitOperationalLogRepairRequest(passive), false)
  assert.equal(isPastedOperationalLog(passive), true)
})

test('failure words inside the log do not manufacture explicit repair authority', () => {
  const log = [
    '15:27:17.225 Running "vercel build"',
    '16:07:21.324 ✖ repair workflow does not fail closed',
    'Error: Command "npm test" exited with 1',
  ].join('\n')
  assert.equal(isExplicitOperationalLogRepairRequest(log), false)
  assert.equal(isPastedOperationalLog(log), true)
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
