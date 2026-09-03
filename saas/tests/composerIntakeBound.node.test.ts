// saas/tests/composerIntakeBound.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  boundComposerIntake,
  COMPOSER_ELISION,
  PUBLIC_COMPOSER_MAX_CHARS,
} from '../lib/ai/cos/composerIntakeBound.ts'
import { analyzeOperationalLog, isOperationalLogEvidence } from '../lib/ai/cos/pastedOperationalLog.ts'

function vercelLog(padLines: number): string {
  const head = [
    '10:23:10.739 Cloning github.com/SignalBoost/signalboost-live (Branch: fix/example, Commit: f52fa22)',
    '10:23:14.428 Vercel CLI 59.3.0',
    '10:23:16.226 Running "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build"',
  ]
  const middle = Array.from({ length: padLines }, (_, index) =>
    `10:23:${String(16 + (index % 7)).padStart(2, '0')}.${String(index % 1000).padStart(3, '0')} ✔ a passing gate case number ${index} completed without incident (0.${index}ms)`)
  const tail = [
    '10:23:23.336 ✖ failing tests:',
    '10:23:23.336 ✖ both answer paths resolve markers before anything else sees the text (1.174384ms)',
    '10:23:23.353 Error: Command "node scripts/vercel-cos-gates.mjs && npm run prebuild && next build" exited with 1',
  ]
  return [...head, ...middle, ...tail].join('\n')
}

test('the exact production symptom: front truncation hides the failure, this bound does not', () => {
  const log = vercelLog(900)
  assert.ok(log.length > PUBLIC_COMPOSER_MAX_CHARS, 'fixture must exceed the bound')

  // What the old textarea maxLength did.
  const frontTruncated = log.slice(0, 8_000)
  assert.equal(isOperationalLogEvidence(frontTruncated), true)
  assert.equal(analyzeOperationalLog(frontTruncated).failed, false)

  // What the composer sends now.
  const bounded = boundComposerIntake(log)
  const analysis = analyzeOperationalLog(bounded)
  assert.equal(analysis.failed, true)
  assert.equal(analysis.exitCode, 1)
  assert.match(String(analysis.command), /vercel-cos-gates\.mjs/)
  assert.ok(analysis.testFailures.length > 0)
})

test('the head is kept too, so the deployment is still identifiable', () => {
  const bounded = boundComposerIntake(vercelLog(900))
  assert.match(bounded, /Cloning github\.com\/SignalBoost\/signalboost-live/)
  assert.match(bounded, /Commit: f52fa22/)
})

test('the omission is explicit, never silent', () => {
  const bounded = boundComposerIntake(vercelLog(900))
  assert.ok(bounded.includes(COMPOSER_ELISION.trim()))
})

test('the bound is respected and ordinary input is untouched', () => {
  assert.ok(boundComposerIntake(vercelLog(900)).length <= PUBLIC_COMPOSER_MAX_CHARS)
  const ordinary = 'Write me a short product update email.'
  assert.equal(boundComposerIntake(ordinary), ordinary)
  assert.equal(boundComposerIntake(''), '')
  assert.equal(boundComposerIntake(undefined), '')
  assert.equal(boundComposerIntake(null), '')
})

test('a custom smaller bound still preserves the tail', () => {
  const bounded = boundComposerIntake(vercelLog(900), 2_000)
  assert.ok(bounded.length <= 2_000)
  assert.equal(analyzeOperationalLog(bounded).exitCode, 1)
})

test('the public composer no longer front-truncates and routes through the bound', () => {
  const source = readFileSync('app/page.tsx', 'utf8')
  assert.doesNotMatch(source, /maxLength=\{8000\}/)
  assert.match(source, /boundComposerIntake\(/)
})
